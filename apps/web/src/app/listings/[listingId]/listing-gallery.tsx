"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useRef, useState } from "react";
import type { PublicListingDetailResponse } from "@/lib/api";

type GalleryImage = PublicListingDetailResponse["imageMetadata"][number];

export function ListingGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = images[selectedIndex];

  if (!selected) {
    return <div className="gallery-empty">No images observed</div>;
  }

  function move(offset: number) {
    setSelectedIndex((current) => (current + offset + images.length) % images.length);
  }

  return (
    <section className="gallery" aria-label={`${title} images`}>
      <div className="gallery-main-wrap">
        <button
          className="gallery-main"
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          aria-label="Open larger image"
        >
          <Image
            loader={passthroughImageLoader}
            unoptimized
            src={selected.imageUrl}
            alt={`${title} image ${selected.position ?? selectedIndex + 1}`}
            fill
            priority
            sizes="(max-width: 800px) 100vw, 65vw"
            referrerPolicy="no-referrer"
          />
        </button>
        {images.length > 1 ? (
          <div className="gallery-controls">
            <button type="button" onClick={() => move(-1)} aria-label="Previous image">
              <Chevron direction="left" />
            </button>
            <span>
              {selectedIndex + 1} / {images.length}
            </span>
            <button type="button" onClick={() => move(1)} aria-label="Next image">
              <Chevron direction="right" />
            </button>
          </div>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="gallery-thumbnails" aria-label="Choose image">
          {images.map((image, index) => (
            <button
              key={image.imageUrl}
              className={index === selectedIndex ? "selected" : undefined}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={`Show image ${index + 1}`}
              aria-pressed={index === selectedIndex}
            >
              <Image
                loader={passthroughImageLoader}
                unoptimized
                src={image.imageUrl}
                alt=""
                fill
                sizes="88px"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </button>
          ))}
        </div>
      ) : null}

      <dialog
        className="gallery-dialog"
        ref={dialogRef}
        aria-label={`${title} image viewer`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        <button className="gallery-dialog-close" type="button" onClick={() => dialogRef.current?.close()}>
          Close
        </button>
        <div className="gallery-dialog-image">
          <Image
            loader={passthroughImageLoader}
            unoptimized
            src={selected.imageUrl}
            alt={`${title} image ${selected.position ?? selectedIndex + 1}`}
            fill
            sizes="95vw"
            referrerPolicy="no-referrer"
          />
        </div>
        {images.length > 1 ? (
          <div className="gallery-dialog-controls">
            <button type="button" onClick={() => move(-1)}>
              Previous
            </button>
            <span>
              {selectedIndex + 1} / {images.length}
            </span>
            <button type="button" onClick={() => move(1)}>
              Next
            </button>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}

function passthroughImageLoader({ src }: ImageLoaderProps) {
  return src;
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d={direction === "left" ? "m12.5 4.5-5 5.5 5 5.5" : "m7.5 4.5 5 5.5-5 5.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
