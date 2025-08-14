import { ReactNode, useEffect, useRef, useState } from 'react';

import styles from './styles.module.css';
import { Canvas, GrainyGradientProps } from '../../lib/canvas';

interface ComponentProps extends GrainyGradientProps {
    /** Whether to render a gradient background if the WebGL context fails to load. */
    fallbackBackground?: boolean;
    /** Standard React `className` property. */
    className?: string;
    /** Standard React children. */
    children?: ReactNode;
}

/**
 * Grainy gradient renderer using WebGL.
 */
export function GrainyGradient({
    gradient,
    fallbackBackground = true,
    debugShowFallback = false,
    className,
    children,
    ...props
}: ComponentProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [dim, setDim] = useState<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) throw Error('failed to initialize container');

        const onResize = () => {
            const { width, height } = container.getBoundingClientRect();
            setDim({ width, height });
        };

        const resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(container);

        return () => resizeObserver.disconnect();
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
                            : gradient(performance.now())
                        : undefined,
            }}
            ref={containerRef}
        >
            <Canvas
                gradient={gradient}
                width={dim.width}
                height={dim.height}
                debugShowFallback={debugShowFallback}
                {...props}
            />
            <div className={styles.children}>{children}</div>
        </div>
    );
}
