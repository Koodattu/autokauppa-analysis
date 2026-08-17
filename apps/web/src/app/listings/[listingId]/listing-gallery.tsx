"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { PublicListingDetailResponse } from "@/lib/api";
import { firstAvailableListingImageUrl } from "@/lib/listing-images";

type GalleryImage = PublicListingDetailResponse["imageMetadata"][number];

export function ListingGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const failedUrlSet = new Set(failedUrls);
  const availableImages = images.flatMap((image) => {
    const displayUrl = firstAvailableListingImageUrl(image, failedUrlSet);
    return displayUrl ? [{ ...image, displayUrl }] : [];
  });
  const activeIndex = Math.min(selectedIndex, Math.max(availableImages.length - 1, 0));
  const selected = availableImages[activeIndex];

  if (!selected) {
    return <div className="gallery-empty">No images observed</div>;
  }

  function move(offset: number) {
    setSelectedIndex((current) => (
      (Math.min(current, availableImages.length - 1) + offset + availableImages.length) % availableImages.length
    ));
  }

  function markFailed(imageUrl: string) {
    setFailedUrls((current) => current.includes(imageUrl) ? current : [...current, imageUrl]);
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
            src={selected.displayUrl}
            alt={`${title} image ${selected.position ?? activeIndex + 1}`}
            fill
            preload={activeIndex === 0}
            sizes="(max-width: 800px) 100vw, 65vw"
            unoptimized={selected.displayUrl.startsWith("/media/heroes/")}
            referrerPolicy="no-referrer"
            onError={() => markFailed(selected.displayUrl)}
          />
        </button>
        {availableImages.length > 1 ? (
          <div className="gallery-controls">
            <button type="button" onClick={() => move(-1)} aria-label="Previous image">
              <Chevron direction="left" />
            </button>
            <span aria-live="polite">
              {activeIndex + 1} / {availableImages.length}
            </span>
            <button type="button" onClick={() => move(1)} aria-label="Next image">
              <Chevron direction="right" />
            </button>
          </div>
        ) : null}
      </div>

      {availableImages.length > 1 ? (
        <div className="gallery-thumbnails" aria-label="Choose image">
          {availableImages.map((image, index) => (
            <button
              key={`${image.imageUrl}-${image.position ?? index}`}
              className={index === activeIndex ? "selected" : undefined}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={`Show image ${index + 1}`}
              aria-pressed={index === activeIndex}
            >
              <Image
                src={image.displayUrl}
                alt=""
                fill
                sizes="88px"
                unoptimized={image.displayUrl.startsWith("/media/heroes/")}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => markFailed(image.displayUrl)}
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
        onKeyDown={(event) => {
          if (availableImages.length < 2) {
            return;
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
        }}
      >
        <button className="gallery-dialog-close" type="button" onClick={() => dialogRef.current?.close()}>
          Close
        </button>
        <div className="gallery-dialog-image">
          <Image
            src={selected.displayUrl}
            alt={`${title} image ${selected.position ?? activeIndex + 1}`}
            fill
            sizes="95vw"
            unoptimized={selected.displayUrl.startsWith("/media/heroes/")}
            referrerPolicy="no-referrer"
            onError={() => markFailed(selected.displayUrl)}
          />
        </div>
        {availableImages.length > 1 ? (
          <div className="gallery-dialog-controls">
            <button type="button" onClick={() => move(-1)} aria-label="Previous image">
              Previous
            </button>
            <span aria-live="polite">
              {activeIndex + 1} / {availableImages.length}
            </span>
            <button type="button" onClick={() => move(1)} aria-label="Next image">
              Next
            </button>
          </div>
        ) : null}
      </dialog>
    </section>
  );
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
