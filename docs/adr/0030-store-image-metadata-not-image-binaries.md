# Store Image Metadata, not image binaries

The first implementation will store Image Metadata such as image URLs and image
counts, but it will not download and store image binaries. Images are not core to
the analytics product, and storing binaries would add significant storage,
legal, and operational complexity.
