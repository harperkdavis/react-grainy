import { AngularNode, ColorStop, DirectionalNode, LinearGradientNode } from 'gradient-parser';
import seedrandom from 'seedrandom';
import Values from 'values.js';

export const SHIMMER_FACTOR = 1.0 / 1000.0 / 60.0 / 10.0;

export const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_texcoord;
varying float v_factor;

uniform float u_factors[4];

void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_texcoord = a_position * 0.5 + 0.5;

    int index = int(a_position.x * 0.5 + 0.5) + int(a_position.y * 0.5 + 0.5) * 2;
    v_factor = u_factors[index];
}
`;

export const FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_noise_texture;
uniform vec2 u_scale;

uniform vec3 u_colors[8];
uniform float u_offsets[8];

uniform float u_tex_offset;

varying vec2 v_texcoord;
varying float v_factor;

void main() {
    vec3 color = vec3(0);
    float noise = texture2D(u_noise_texture, v_texcoord * u_scale + vec2(1) * u_tex_offset).r;
    if (v_factor < u_offsets[0]) {
        color = u_colors[0];
    }
    ${new Array(7)
        .fill('')
        .map(
            (_, i) => `
    if (v_factor >= u_offsets[${i}] && v_factor < u_offsets[${i + 1}]) {
        float scaledFactor = (v_factor - u_offsets[${i}]) / (u_offsets[${i + 1}] - u_offsets[${i}]);
        if (scaledFactor < noise) {
            color = u_colors[${i}];
        } else {
            color = u_colors[${i + 1}];
        }
    }
`
        )
        .join('\n')}
    gl_FragColor = vec4(color, 1);
}
`;

function mod(n: number, d: number) {
    return ((n % d) + d) % d;
}

export function createNoiseSource(seed: string | number, size: number) {
    const rng = seedrandom(seed.toString());
    const dataArray = new Uint8ClampedArray(
        new Array(size * size).fill(null).flatMap(() => {
            const val = Math.floor(rng() * 255);
            return [val, val, val, 255];
        })
    );
    return new ImageData(dataArray, size, size);
}

interface ParsedGradient {
    /** The number of stops in the gradient. */
    count: number;
    /** The color of each stop. */
    colors: [number, number, number][];
    /** The offset of each stop. */
    offsets: number[];
    /** The progress through the gradient at each corner of the quad.
     *  In the order, top left, top right, bottom left, bottom right.
     * */
    corners: [number, number, number, number];
}

function parseAngle(orientation: DirectionalNode | AngularNode | undefined) {
    if (!orientation) return (Math.PI * 3) / 2;
    if (orientation.type === 'directional') {
        switch (orientation.value) {
            case 'left':
                return Math.PI;
            case 'top':
                return Math.PI / 2;
            case 'bottom':
                return (Math.PI * 3) / 2;
            case 'right':
                return 0;
            case 'left top':
                return (Math.PI * 3) / 4;
            case 'top left':
                return (Math.PI * 3) / 4;
            case 'left bottom':
                return (Math.PI * 5) / 4;
            case 'bottom left':
                return (Math.PI * 5) / 4;
            case 'right top':
                return Math.PI / 4;
            case 'top right':
                return Math.PI / 4;
            case 'right bottom':
                return (Math.PI * 7) / 4;
            case 'bottom right':
                return (Math.PI * 7) / 4;
        }
    } else {
        try {
            return (parseInt(orientation.value) / 180) * Math.PI + (Math.PI * 3) / 2;
        } catch (_) {
            return 0;
        }
    }
}

function gradientInfluence(width: number, height: number, angle: number) {
    const aspectMagnitude = Math.max(Math.sqrt(width * width + height * height), 1);
    const [aspectX, aspectY] = [width / aspectMagnitude, height / aspectMagnitude];
    const [dirX, dirY] = [Math.cos(angle), Math.sin(angle)];
    const dotProduct = aspectX * dirX + aspectY * dirY;
    return Math.min(Math.max(dotProduct, -1.0), 1.0) * 0.5 + 0.5;
}

interface ParsedStops {
    count: number;
    colors: [number, number, number][];
    offsets: number[];
}

function parseStopColor(stop: ColorStop): [number, number, number] {
    let colorString;
    if (stop.type === 'literal') {
        colorString = stop.value;
    } else if (stop.type === 'hex') {
        colorString = `#${stop.value}`;
    } else if ((stop.type as unknown as string) === 'hsl') {
        // gradient-parser still able to return hsl values even if not in type declarations
        colorString = `hsl(${stop.value[0]}deg, ${stop.value[1]}%, ${stop.value[2]}%)`;
    } else {
        colorString = `${stop.type}(${stop.value.map((val) => val || '').join(', ')})`;
    }
    const { rgb } = new Values(colorString);
    return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

function getRemInPx() {
    const rootElement = document.documentElement;
    const computedStyle = window.getComputedStyle(rootElement);
    const fontSizePx = parseFloat(computedStyle.fontSize);
    return fontSizePx;
}

function parseStopPosition(stop: ColorStop, index: number, count: number, diagonal: number) {
    const len = stop.length;
    const maxIndex = Math.max(count - 1, 1);
    if (!len) return index / maxIndex;
    if (len.type === 'px') {
        try {
            return parseInt(len.value) / diagonal;
        } catch (_) {
            return index / maxIndex;
        }
    } else if (len.type === 'em') {
        try {
            return (getRemInPx() * parseInt(len.value)) / diagonal;
        } catch (_) {
            return index / maxIndex;
        }
    } else {
        try {
            return parseInt(len.value) / 100;
        } catch (_) {
            return index / maxIndex;
        }
    }
}

function parseStops(stops: ColorStop[], diagonal: number): ParsedStops {
    return {
        count: stops.length,
        colors: stops.map(parseStopColor),
        offsets: stops.map((stop, index) => parseStopPosition(stop, index, stops.length, diagonal)),
    };
}

export function parseGradient(
    gradient: LinearGradientNode,
    width: number,
    height: number,
    preserveAspect = false
): ParsedGradient {
    const angle = mod(parseAngle(gradient.orientation), Math.PI * 2);
    const [iw, ih] = preserveAspect ? [width, height] : [1, 1];
    const stops = parseStops(
        gradient.colorStops,
        Math.max(Math.sqrt(width * width + height * height), 1)
    );

    return {
        ...stops,
        corners: [
            gradientInfluence(-iw, ih, angle),
            gradientInfluence(iw, ih, angle),
            gradientInfluence(-iw, -ih, angle),
            gradientInfluence(iw, -ih, angle),
        ],
    };
}
