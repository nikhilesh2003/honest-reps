"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: BottomSheetProps) {
  const titleId = useId();
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    if (!open) {
      setDragOffset(0);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollTop = scrollBodyRef.current?.scrollTop ?? 0;
    if (scrollTop > 4) {
      touchStartYRef.current = null;
      return;
    }
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const currentY = e.touches[0]?.clientY ?? touchStartYRef.current;
    const delta = currentY - touchStartYRef.current;
    if (delta > 0) {
      setDragOffset(Math.min(260, delta));
    }
  };

  const handleTouchEnd = () => {
    if (dragOffset > 92) {
      setDragOffset(0);
      onClose();
    } else {
      setDragOffset(0);
    }
    touchStartYRef.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={
          dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)`, transition: "none" }
            : undefined
        }
        className="w-full max-w-md bg-[#0c0c0e] border border-white/12 rounded-t-[26px] sm:rounded-[24px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden transition-transform duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle Header */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="pt-2.5 select-none"
        >
          <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mb-2 sm:hidden" />
          <div className="flex items-start justify-between px-5 pt-1.5 pb-3 border-b border-white/[0.06]">
            <div>
              <h2
                id={titleId}
                className="text-[18px] font-semibold tracking-[-0.02em] text-[#f5f5f7]"
              >
                {title}
              </h2>
              {subtitle && (
                <p className="text-[12px] text-[#86868b] mt-0.5">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[#86868b] hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={scrollBodyRef}
          className="px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] overflow-y-auto no-scrollbar"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
