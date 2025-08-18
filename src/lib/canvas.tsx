import gradientParser from 'gradient-parser';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as twgl from 'twgl.js';

import styles from './canvas.module.css';

import {
    VERTEX_SHADER,
    FRAGMENT_SHADER,
    createNoiseSource,
    parseGradient,
    SHIMMER_FACTOR,
} from './utils';

function initializeCanvas(gl: WebGLRenderingContext): WebGLProgram {
    // Create WebGL shader
    const program = twgl.createProgramFromSources(gl, [VERTEX_SHADER, FRAGMENT_SHADER]);
    gl.useProgram(program);

    // Create screen quad
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Corners in order: top left, top right, bottom left,
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Bind noise texture sampler to texture unit 0 once
    const samplerLocation = gl.getUniformLocation(program, 'u_noise_texture');
    if (samplerLocation) {
        gl.uniform1i(samplerLocation, 0);
    }
    return program;
}

function renderGradient(
    gl: WebGLRenderingContext,
    program: WebGLProgram,

    width: number,
    height: number,

    gradient: string,
    grainSize: number,

    grainOffset: number,
    preserveAspect: boolean
) {
    const parsed = gradientParser.parse(gradient);
    if (parsed.length !== 1) throw Error('can only support one gradient');

    const data = parsed[0];
    if (data.type !== 'linear-gradient')
        throw Error('only linear-gradient is supported at this time');
    if (data.colorStops.length < 1) throw Error('gradient needs at least two color stops');

    const parsedGradient = parseGradient(data, width, height, preserveAspect);

    gl.useProgram(program);

    const scaleLocation = gl.getUniformLocation(program, 'u_scale');
    gl.uniform2f(
        scaleLocation,
        (width / grainSize) * 1.0 * Math.E,
        (height / grainSize / 1.0) * Math.E
    );

    const factorsLocation = gl.getUniformLocation(program, 'u_factors');
    const factorsArray = new Float32Array(4);
    for (let i = 0; i < 4; i += 1) {
        factorsArray[i] = parsedGradient.corners[i];
    }
    gl.uniform1fv(factorsLocation, factorsArray);

    const colorsLocation = gl.getUniformLocation(program, 'u_colors');
    const offsetsLocation = gl.getUniformLocation(program, 'u_offsets');

    const colorsArray = new Float32Array(24);
    const offsetsArray = new Float32Array(8);

    for (let i = 0; i < 8; i += 1) {
        const color =
            i < parsedGradient.count
                ? parsedGradient.colors[i]
                : parsedGradient.colors[parsedGradient.count - 1];
        colorsArray[i * 3 + 0] = color[0];
        colorsArray[i * 3 + 1] = color[1];
        colorsArray[i * 3 + 2] = color[2];

        offsetsArray[i] = i < parsedGradient.count ? parsedGradient.offsets[i] : Infinity;
    }

    gl.uniform3fv(colorsLocation, colorsArray);
    gl.uniform1fv(offsetsLocation, offsetsArray);

    const textureOffsetLocation = gl.getUniformLocation(program, 'u_tex_offset');
    gl.uniform1f(textureOffsetLocation, grainOffset * SHIMMER_FACTOR);

    gl.viewport(0, 0, width, height);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export interface GrainyGradientProps {
    /** Either a string or a function that returns a valid CSS gradient string. The component will throw an error if it cannot parse this string. */
    gradient: string | ((time: number, size?: { width: number; height: number }) => string);
    /** The resolution (side length) of the noise texture. Increase if it looks repetitive. */
    noiseTextureSize?: number;
    /** Seed for the noise texture. Only modify if using multiple gradients and they look samey. */
    noiseSeed?: number | string;

    /** Speed at which the gradient shimmers. Try different values! */
    shimmerSpeed?: number;
    /** Whether to preserve the aspect ratio of the gradient depending on the angle. */
    preserveAspect?: boolean;
    /** Whether to keep the gradient looking pixelated as you zoom in. */
    pixelated?: boolean;
    /** Force the fallback background to render to check consistency. */
    debugShowFallback?: boolean;
    /** Clip path to apply to the canvas. */
    clipPath?: string;
    /** Pause animation even if gradient is a function or shimmerSpeed > 0 */
    paused?: boolean;
    /** Scale the internal rendering resolution relative to CSS pixels. */
    resolutionScale?: number;
    /** Called once after the first successful draw. */
    onReady?: () => void;
    /** Called if WebGL context fails or a rendering error occurs. */
    onContextError?: (error: Error) => void;
    /** Attributes passed to getContext('webgl', ...) */
    contextAttributes?: WebGLContextAttributes;
    /** Force WebGL1 context if possible. */
    forceWebGL1?: boolean;
    /** Extra className applied to the canvas element. */
    canvasClassName?: string;
    /** Initial time to seed the first frame for deterministic rendering. */
    initialTime?: number;
}

interface CanvasProps extends GrainyGradientProps {
    width: number;
    height: number;

    clipPath?: string;
}

export function Canvas({
    width,
    height,

    clipPath,

    gradient,

    noiseTextureSize,
    noiseSeed = 0xcafe,

    shimmerSpeed = 0.0,
    preserveAspect = true,
    pixelated = false,

    debugShowFallback = false,
    paused = false,
    resolutionScale = 1,
    onReady,
    onContextError,
    contextAttributes,
    forceWebGL1 = true,
    canvasClassName,
    initialTime = 0,
}: CanvasProps): ReactElement {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const animationFrameId = useRef<number | null>(null);
    const didFireReady = useRef(false);

    const [gl, setGl] = useState<WebGLRenderingContext | null>(null);
    const [program, setProgram] = useState<WebGLProgram | null>(null);
    const [grainTexture, setGrainTexture] = useState<WebGLTexture | null>(null);

    const render = useCallback(() => {
        if (!gl || !program || !grainTexture || !canvasRef.current) return;
        // Ensure correct texture unit binding on every draw for robustness
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, grainTexture);
        const now = performance.now();
        const [cw, ch] = [canvasRef.current.width, canvasRef.current.height];
        const time = initialTime + now;
        const effectiveNoiseSize =
            typeof noiseTextureSize === 'number' && Number.isFinite(noiseTextureSize)
                ? noiseTextureSize
                : 256;
        const effectiveShimmer =
            typeof shimmerSpeed === 'number' && Number.isFinite(shimmerSpeed) ? shimmerSpeed : 0.0;
        const gradientString =
            typeof gradient === 'string' ? gradient : gradient(time, { width: cw, height: ch });
        renderGradient(
            gl,
            program,
            cw,
            ch,
            gradientString,
            Math.max(1, effectiveNoiseSize),
            effectiveShimmer * now,
            preserveAspect
        );
        if (animationFrameId.current !== null) requestAnimationFrame(render);
        if (!didFireReady.current) {
            didFireReady.current = true;
            onReady?.();
        }
    }, [
        initialTime,
        shimmerSpeed,
        gl,
        program,
        noiseTextureSize,
        grainTexture,
        gradient,
        preserveAspect,
        onReady,
    ]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) throw Error('could not create canvas');

        // Try multiple context types for broader compatibility
        let context: WebGLRenderingContext | null = null;
        try {
            if (forceWebGL1) {
                context = canvas.getContext('webgl', contextAttributes ?? undefined);
            }
            if (!context) {
                context = canvas.getContext(
                    'experimental-webgl',
                    contextAttributes ?? undefined
                ) as unknown as WebGLRenderingContext | null;
            }
        } catch (err) {
            onContextError?.(err as Error);
        }
        if (!context) {
            onContextError?.(new Error('WebGL context not available'));
            return;
        }

        setGl(context);
        setProgram(initializeCanvas(context));
    }, [contextAttributes, forceWebGL1, onContextError]);

    useEffect(() => {
        if (!program) return;

        const canvas = canvasRef.current;
        if (!canvas) throw Error('could not create canvas');
        if (!gl) return;

        let texture = grainTexture;
        if (!texture) {
            texture = gl.createTexture();
            setGrainTexture(texture);
        }

        const effectiveSize =
            typeof noiseTextureSize === 'number' && Number.isFinite(noiseTextureSize)
                ? noiseTextureSize
                : 256;
        const textureData = createNoiseSource(noiseSeed, effectiveSize);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureData);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        gl.generateMipmap(gl.TEXTURE_2D);
    }, [program, noiseSeed, noiseTextureSize, gl, grainTexture]);

    useEffect(() => {
        if (!program) return;
        if (!grainTexture) return;

        const canvas = canvasRef.current;
        if (!canvas) throw Error('could not create canvas');
        if (!gl) return;

        const effectiveShimmer =
            typeof shimmerSpeed === 'number' && Number.isFinite(shimmerSpeed) ? shimmerSpeed : 0.0;
        const animated = (typeof gradient === 'function' || effectiveShimmer > 0) && !paused;

        if (animated) {
            animationFrameId.current = requestAnimationFrame(render);
        } else {
            animationFrameId.current = null;
            // For non-animated, draw once on the next frame to ensure layout settles
            requestAnimationFrame(() => render());
        }

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [
        grainTexture,
        gradient,
        shimmerSpeed,
        preserveAspect,
        gl,
        program,
        render,
        width,
        height,
        noiseTextureSize,
        paused,
    ]);

    return (
        <canvas
            width={Math.max(1, Math.round(width * Math.max(0.1, resolutionScale)))}
            height={Math.max(1, Math.round(height * Math.max(0.1, resolutionScale)))}
            className={`${styles.canvas} ${pixelated ? styles.pixelated : ''} ${canvasClassName ?? ''}`}
            style={{
                borderRadius: 'inherit',
                visibility: debugShowFallback ? 'hidden' : 'unset',
                clipPath,
            }}
            ref={canvasRef}
        />
    );
}
