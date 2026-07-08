import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';

// expo-image is a third-party component, so NativeWind does not map `className`
// onto its `style` prop out of the box. Register it once here.
cssInterop(Image, { className: 'style' });
