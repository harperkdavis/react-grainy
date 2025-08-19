![react-grainy](https://i.imgur.com/WI9r5s5.png)

> Grainy Gradients for the Modern Web

---

A modular and flexible component library for React. Supports a variety
of gradient features.

## Installation

### npm

```bash
npm i react-grainy
```

### yarn

```bash
yarn add react-grainy
```

### bun

```bash
bun add react-grainy
```

## Usage

### Basic: static gradient

```tsx
import { GrainyGradient } from 'react-grainy';

export default function Example() {
    return (
        <GrainyGradient gradient='linear-gradient(90deg, #000, #fff)'>
            <div style={{ width: 400, height: 200 }} />
        </GrainyGradient>
    );
}
```

### With content overlay

```tsx
<GrainyGradient gradient='linear-gradient(45deg, #de6262, #ffb88c)'>
    <div style={{ width: 400, height: 200, display: 'grid', placeItems: 'center' }}>
        <span style={{ color: 'white', fontWeight: 700 }}>Hello</span>
    </div>
</GrainyGradient>
```

### Shimmer (animated noise)

```tsx
<GrainyGradient
    gradient='linear-gradient(90deg, #f00, #00f)'
    shimmerSpeed={2}
>
    <div style={{ width: 400, height: 200 }} />
</GrainyGradient>
```

### Animated gradient function

```tsx
<GrainyGradient gradient={(time) => `linear-gradient(${time / 10}deg, #000428, #004e92)`}>
    <div style={{ width: 400, height: 200 }} />
</GrainyGradient>
```

Attribution is not required, but is always welcome! If you make anything cool, feel free to email me at
[harper@hked.live](mailto:harper@hked.live).
