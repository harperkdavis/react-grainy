import type { ReactElement, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import styles from './styles.module.css';
import type { GrainyGradientProps } from '../../lib/canvas';
import { Canvas } from '../../lib/canvas';

interface ComponentProps extends GrainyGradientProps {
    /** Whether to render a gradient background if the WebGL context fails to load. */
    fallbackBackground?: boolean;
    /** Standard React `className` property. */
    className?: string;
    /** Optional className for the canvas element. */
    canvasClassName?: string;
    /** Standard React children. */
    children?: ReactNode;
    /** Optional inline style for the container. */
    style?: React.CSSProperties;
}

/**
 * Grainy gradient renderer using WebGL.
 */
export function GrainyGradient({
    gradient,
    fallbackBackground = true,
    debugShowFallback = false,
    className,
    canvasClassName,
    style,
    children,
    ...props
}: ComponentProps): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [dim, setDim] = useState<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) throw Error('failed to initialize container');

        // Ensure we capture the initial size immediately on mount
        const initialRect = container.getBoundingClientRect();
        setDim({
            width: Math.max(0, Math.round(initialRect.width)),
            height: Math.max(0, Math.round(initialRect.height)),
        });

        const cleanupFns: (() => void)[] = [];

        if (typeof ResizeObserver !== 'undefined') {
            const onResize: ResizeObserverCallback = (entries) => {
                const entry = entries[0];
                const rect = entry?.contentRect ?? container.getBoundingClientRect();
                const width = Math.max(0, Math.round(rect.width));
                const height = Math.max(0, Math.round(rect.height));
                setDim({ width, height });
            };
            const resizeObserver = new ResizeObserver(onResize);
            resizeObserver.observe(container);
            cleanupFns.push(() => resizeObserver.disconnect());
        } else if (typeof window !== 'undefined') {
            const handler = () => {
                const rect = container.getBoundingClientRect();
                setDim({
                    width: Math.max(0, Math.round(rect.width)),
                    height: Math.max(0, Math.round(rect.height)),
                });
            };
            window.addEventListener('resize', handler, { passive: true });
            cleanupFns.push(() => window.removeEventListener('resize', handler));
        }

        return () => {
            cleanupFns.forEach((fn) => fn());
        };
    }, []);

    return (
        <div
            className={`${styles.container} ${className}`}
            style={{
                position: 'relative',
                background:
                    fallbackBackground || debugShowFallback
                        ? typeof gradient === 'string'
                            ? gradient
                            : gradient(0, { width: dim.width, height: dim.height })
                        : undefined,
                ...style,
            }}
            ref={containerRef}
        >
            <Canvas
                gradient={gradient}
                width={dim.width}
                height={dim.height}
                debugShowFallback={debugShowFallback}
                canvasClassName={canvasClassName}
                {...props}
            />
            <div className={styles.children}>{children}</div>
        </div>
    );
}
