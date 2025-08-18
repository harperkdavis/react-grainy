import type { Meta, StoryObj } from '@storybook/react-vite';

import { GrainyGradient } from '.';

const innerElement = <div style={{ width: 400, height: 200, pointerEvents: 'none' }} />;
const ResizableInner = () => {
    return (
        <div
            style={{
                resize: 'both',
                overflow: 'auto',
                width: 300,
                height: 180,
                border: '1px dashed #999',
                background: 'rgba(255,255,255,0.04)',
            }}
        />
    );
};

const meta = {
    title: 'Components/GrainyGradient',
    component: GrainyGradient,

    parameters: {
        layout: 'centered',
        docs: {
            controls: {
                exclude: ['children'],
            },
        },
    },

    tags: ['autodocs'],

    argTypes: {
        children: {
            options: ['400x200', '200x400', '400x400', 'resizable'],
            mapping: {
                '400x200': innerElement,
                '200x400': <div style={{ width: 200, height: 400 }} />,
                '400x400': <div style={{ width: 400, height: 400 }} />,
                resizable: <ResizableInner />,
            },
        },
    },
    args: {},
} satisfies Meta<typeof GrainyGradient>;

export default meta;
type Story = StoryObj<typeof GrainyGradient>;

export const SimpleBlackWhite: Story = {
    args: {
        gradient: 'linear-gradient(90deg, #000, #fff)',
        children: innerElement,
        shimmerSpeed: 0,
    },
};

export const SimpleBlackWhitePositioned: Story = {
    args: {
        gradient: 'linear-gradient(90deg, #000 0%, #fff 50%)',
        children: innerElement,
    },
};

export const BicolorAngled: Story = {
    args: {
        gradient: 'linear-gradient(45deg, #de6262, #ffb88c)',
        children: <div style={{ width: 400, height: 200, pointerEvents: 'none' }} />,
        noiseTextureSize: 256,
    },
};

export const Tricolor: Story = {
    args: {
        gradient: 'linear-gradient(180deg, #D60270 30%, #9B4F96 50%, #0038A8 70%)',
        children: innerElement,
    },
};

export const ShimmerSlow: Story = {
    args: {
        gradient: 'linear-gradient(90deg, #f00, #000)',
        shimmerSpeed: 1,
        children: innerElement,
    },
};

export const ShimmerFast: Story = {
    args: {
        gradient: 'linear-gradient(90deg, #f00, #000)',
        shimmerSpeed: 10,
        children: innerElement,
    },
};

export const AnimatedSpin: Story = {
    args: {
        gradient: (time: number) => {
            return `linear-gradient(${time / 10}deg, #000428, #004e92)`;
        },
        children: innerElement,
    },
};

export const AnimatedSpinShimmer: Story = {
    args: {
        gradient: (time: number) => {
            return `linear-gradient(${time / 10}deg, #000428, #004e92)`;
        },
        shimmerSpeed: 2,
        children: innerElement,
    },
};

export const AnimatedColor: Story = {
    args: {
        gradient: (time: number) => {
            return `linear-gradient(90deg, hsl(0, 0%, ${Math.sin(time / 1000) * 50 + 50}%), #000, hsl(${(time / 20) % 360}, 100%, 50%))`;
        },
        children: innerElement,
    },
};

export const AnimatedPosition: Story = {
    args: {
        gradient: (time: number) => {
            return `linear-gradient(90deg, #f00, #000 ${Math.sin(time / 1000) * 40 + 50}%, #00f)`;
        },
        children: innerElement,
    },
};

export const SizedToText: Story = {
    args: {
        gradient: 'linear-gradient(45deg, #de6262, #ffb88c)',
        children: (
            <p
                style={{
                    fontSize: '4rem',
                    fontFamily: 'sans-serif',
                    fontWeight: 'bolder',
                    margin: 0,
                    lineHeight: 1,
                }}
            >
                This is some text!
            </p>
        ),
    },
};
