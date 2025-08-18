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
    gradient: string | ((time: number) => string);
    /** The resolution of the grain texture. Increase if it looks repetitive. */
    grainSize?: number;
    /** Seed for the grain texture. Only modify if using multiple gradients and they look samey. */
    grainSeed?: number | string;

    /** Speed at which the gradient shimmers. Try different values! */
    shimmer?: number;
    /** Whether to preserve the aspect ratio of the gradient depending on the angle. */
    preserveAspect?: boolean;
    /** Whether to keep the gradient looking pixelated as you zoom in. */
    pixelated?: boolean;
    /** Force the fallback background to render to check consistency. */
    debugShowFallback?: boolean;
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

    grainSize = 256,
    grainSeed = 0xcafe,

    shimmer = 0.0,
    preserveAspect = true,
    pixelated = false,

    debugShowFallback = false,
}: CanvasProps): ReactElement {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const animationFrameId = useRef<number | null>(null);

    const [gl, setGl] = useState<WebGLRenderingContext | null>(null);
    const [program, setProgram] = useState<WebGLProgram | null>(null);
    const [grainTexture, setGrainTexture] = useState<WebGLTexture | null>(null);

    const render = useCallback(() => {
        if (!gl || !program || !grainTexture || !canvasRef.current) return;
        // Ensure correct texture unit binding on every draw for robustness
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, grainTexture);
        const gradientString =
            typeof gradient === 'string' ? gradient : gradient(performance.now());
        const [width, height] = [canvasRef.current.width, canvasRef.current.height];
        renderGradient(
            gl,
            program,
            width,
            height,
            gradientString,
            grainSize,
            shimmer * performance.now(),
            preserveAspect
        );
        if (animationFrameId.current !== null) requestAnimationFrame(render);
    }, [shimmer, gl, program, grainSize, grainTexture, gradient, preserveAspect]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) throw Error('could not create canvas');

        // Try multiple context types for broader compatibility
        const gl =
            canvas.getContext('webgl') ??
            (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
        if (!gl) return;

        setGl(gl);
        setProgram(initializeCanvas(gl));
    }, []);

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

        const textureData = createNoiseSource(grainSeed, grainSize);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureData);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        gl.generateMipmap(gl.TEXTURE_2D);
    }, [program, grainSeed, grainSize, gl, grainTexture]);

    useEffect(() => {
        if (!program) return;
        if (!grainTexture) return;

        const canvas = canvasRef.current;
        if (!canvas) throw Error('could not create canvas');
        if (!gl) return;

        const animated = typeof gradient === 'function' || shimmer > 0;

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
        shimmer,
        preserveAspect,
        gl,
        program,
        render,
        width,
        height,
        grainSize,
    ]);

    return (
        <canvas
            width={width}
            height={height}
            className={`${styles.canvas} ${pixelated ? styles.pixelated : ''}`}
            style={{
                borderRadius: 'inherit',
                visibility: debugShowFallback ? 'hidden' : 'unset',
                clipPath,
            }}
            ref={canvasRef}
        />
    );
}
