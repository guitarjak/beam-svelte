# Product Images

Store your product images in this folder.

## How to use:

1. **Add your product image** to this folder
   - Example: `my-course-cover.jpg`

2. **Reference it in `src/lib/products.json`** using the path:
   ```json
   {
     "slug": "product-1",
     "name": "Super Productivity Course",
     "imageUrl": "/images/products/my-course-cover.jpg"
   }
   ```

3. **That's it!** The image will automatically display on the checkout page.

## Image Guidelines:

- **Recommended size**: 800×800px or larger (square format works best)
- **Formats supported**: JPG, PNG, WebP, GIF
- **Aspect ratio**: Any (will be cropped to fit - centered)
- **File size**: Keep under 2MB for fast loading

## Examples:

```
static/images/products/
├── productivity-course.jpg
├── ai-guide-cover.png
└── marketing-ebook.webp
```

Then in `products.json`:
```json
"imageUrl": "/images/products/productivity-course.jpg"
"imageUrl": "/images/products/ai-guide-cover.png"
"imageUrl": "/images/products/marketing-ebook.webp"
```

## No image?

Leave `imageUrl` empty (`""`) to show the default book icon:
```json
"imageUrl": ""
```
