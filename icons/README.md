# Extension Icons

**Note:** Icons are currently disabled in `manifest.json` to allow the extension to load without them. The extension will use Chrome's default icon placeholder.

This directory can contain extension icons if you want custom branding.

You need to create three PNG icon files:
- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

These are displayed in:
- Browser toolbar (16px)
- Extension management page (48px)
- Chrome Web Store (128px)

## Suggested Icon Design

Since this extension deals with status indicators, consider a design that incorporates:
- A browser tab icon
- Status indicator dots or badges
- Clean, minimal design that works at all sizes

## Placeholder Icons

Until you create proper icons, the extension will work but show the default Chrome extension icon placeholder.

You can use tools like:
- Figma
- Adobe Illustrator
- Canva
- Or any PNG editor

## Quick Placeholder

For testing, you can create simple solid color PNGs:
```bash
# On macOS with ImageMagick:
convert -size 16x16 xc:#4285F4 icon16.png
convert -size 48x48 xc:#4285F4 icon48.png
convert -size 128x128 xc:#4285F4 icon128.png
```
