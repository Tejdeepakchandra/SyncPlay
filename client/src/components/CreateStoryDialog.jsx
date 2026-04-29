import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, Type, Sparkles, UploadCloud, Palette } from "lucide-react";

const STYLE_PRESETS = [
  { id: "midnight", name: "Midnight", value: "#111827", gradient: "linear-gradient(135deg, #111827 0%, #1f2937 100%)" },
  { id: "sunset", name: "Sunset", value: "#be123c", gradient: "linear-gradient(135deg, #be123c 0%, #f97316 100%)" },
  { id: "ocean", name: "Ocean", value: "#0f766e", gradient: "linear-gradient(135deg, #0f766e 0%, #2563eb 100%)" },
  { id: "violet", name: "Violet", value: "#7c3aed", gradient: "linear-gradient(135deg, #7c3aed 0%, #db2777 100%)" },
  { id: "gold", name: "Gold", value: "#b45309", gradient: "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)" },
  { id: "sky", name: "Sky", value: "#1d4ed8", gradient: "linear-gradient(135deg, #1d4ed8 0%, #06b6d4 100%)" },
];

const IMAGE_TEXT_SEGMENT_MS = 4500;
const DEFAULT_VIDEO_SEGMENT_MS = 8000;

export function CreateStoryDialog({ open, onClose, onSubmit, submitting }) {
  const [mode, setMode] = useState("media");
  const [mediaItems, setMediaItems] = useState([]);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [videoDurationMap, setVideoDurationMap] = useState({});
  const [caption, setCaption] = useState("");
  const [textContent, setTextContent] = useState("");
  const [stylePreset, setStylePreset] = useState(STYLE_PRESETS[0]);
  const [isPreviewHeld, setIsPreviewHeld] = useState(false);
  const previewVideoRef = useRef(null);
  const wasPreviewPlayingRef = useRef(false);

  const segments = useMemo(() => {
    if (mode === "media") return mediaItems;
    return [{
      kind: "text",
      url: null,
      file: null,
      id: "text-segment",
    }];
  }, [mode, mediaItems]);

  const activeSegment = segments[activeSegmentIndex] || null;
  const isVideo = activeSegment?.kind === "video";

  const canSubmit = mode === "text" ? textContent.trim().length > 0 : mediaItems.length > 0;

  const reset = () => {
    setMode("media");
    mediaItems.forEach((item) => {
      if (item.url) URL.revokeObjectURL(item.url);
    });
    setMediaItems([]);
    setActiveSegmentIndex(0);
    setSegmentProgress(0);
    setVideoDurationMap({});
    setCaption("");
    setTextContent("");
    setStylePreset(STYLE_PRESETS[0]);
    setIsPreviewHeld(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    await onSubmit({
      mode,
      files: mediaItems.map((item) => item.file),
      caption,
      textContent,
      backgroundColor: stylePreset.value,
    });
    reset();
  };

  const activeSegmentDuration = useMemo(() => {
    if (!activeSegment) return IMAGE_TEXT_SEGMENT_MS;
    if (activeSegment.kind === "video") {
      return videoDurationMap[activeSegment.id] || DEFAULT_VIDEO_SEGMENT_MS;
    }
    return IMAGE_TEXT_SEGMENT_MS;
  }, [activeSegment, videoDurationMap]);

  useEffect(() => {
    setSegmentProgress(0);
  }, [activeSegmentIndex, mode]);

  useEffect(() => {
    if (!open || !activeSegment || isPreviewHeld) return;
    const step = 100;

    const id = window.setInterval(() => {
      setSegmentProgress((prev) => {
        const next = prev + step / activeSegmentDuration;
        if (next >= 1) {
          setActiveSegmentIndex((curr) => (curr + 1 >= segments.length ? 0 : curr + 1));
          return 0;
        }
        return next;
      });
    }, step);

    return () => window.clearInterval(id);
  }, [open, activeSegment, isPreviewHeld, activeSegmentDuration, segments.length]);

  useEffect(() => {
    return () => {
      mediaItems.forEach((item) => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
    };
  }, [mediaItems]);

  const handleAddMedia = (fileList) => {
    const nextFiles = Array.from(fileList || []).filter(Boolean);
    if (!nextFiles.length) return;

    const mapped = nextFiles.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file: f,
      url: URL.createObjectURL(f),
      kind: f.type.startsWith("video/") ? "video" : "photo",
    }));

    setMediaItems((prev) => {
      const merged = [...prev, ...mapped];
      return merged.slice(0, 12);
    });
    setMode("media");
  };

  const handleRemoveSegment = (idToRemove) => {
    setMediaItems((prev) => {
      const target = prev.find((item) => item.id === idToRemove);
      if (target?.url) URL.revokeObjectURL(target.url);
      const next = prev.filter((item) => item.id !== idToRemove);
      const nextIndex = Math.max(0, Math.min(activeSegmentIndex, next.length - 1));
      setActiveSegmentIndex(nextIndex);
      return next;
    });
  };

  const handlePreviewHoldStart = () => {
    if (mode !== "media" || !isVideo || !previewVideoRef.current) return;
    const video = previewVideoRef.current;
    wasPreviewPlayingRef.current = !video.paused && !video.ended;
    video.pause();
    setIsPreviewHeld(true);
  };

  const handlePreviewHoldEnd = () => {
    if (mode !== "media" || !isVideo || !previewVideoRef.current) return;
    const video = previewVideoRef.current;
    if (wasPreviewPlayingRef.current) {
      video.play().catch(() => null);
    }
    setIsPreviewHeld(false);
  };

  const goPrevSegment = () => {
    if (segments.length <= 1) return;
    setActiveSegmentIndex((curr) => (curr === 0 ? segments.length - 1 : curr - 1));
    setSegmentProgress(0);
  };

  const goNextSegment = () => {
    if (segments.length <= 1) return;
    setActiveSegmentIndex((curr) => (curr + 1 >= segments.length ? 0 : curr + 1));
    setSegmentProgress(0);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? handleClose() : null)}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden border-border/60 rounded-3xl bg-card backdrop-blur-xl data-[state=open]:duration-500 data-[state=closed]:duration-300 data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-90 data-[state=open]:slide-in-from-top-[44%] data-[state=closed]:slide-out-to-top-[54%]">
        <DialogHeader className="px-6 py-5 border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.14),hsl(var(--secondary)/0.12),hsl(var(--accent)/0.08))]">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Create Story
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground/90">
            Share a photo, video, or text moment with your friends.
          </DialogDescription>
        </DialogHeader>

        <div className="grid lg:grid-cols-[360px_1fr] gap-0">
          <div className="p-6 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.22))] border-r border-border/60">
            <div className="mx-auto w-[260px] max-w-full">
              <div className="relative rounded-[2.2rem] bg-black p-2 shadow-2xl">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full" />
                <div
                  className="rounded-[1.7rem] overflow-hidden aspect-[9/16] bg-muted relative"
                  onMouseDown={handlePreviewHoldStart}
                  onMouseUp={handlePreviewHoldEnd}
                  onMouseLeave={handlePreviewHoldEnd}
                  onTouchStart={handlePreviewHoldStart}
                  onTouchEnd={handlePreviewHoldEnd}
                  onTouchCancel={handlePreviewHoldEnd}
                >
                  <div className="absolute top-3 left-3 right-3 z-10 flex gap-1.5">
                    {segments.map((segment, idx) => {
                      const width = idx < activeSegmentIndex ? 100 : idx === activeSegmentIndex ? segmentProgress * 100 : 0;
                      return (
                        <div key={segment.id} className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden">
                          <div className="h-full bg-white transition-all duration-100" style={{ width: `${width}%` }} />
                        </div>
                      );
                    })}
                  </div>

                  {segments.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="absolute left-0 top-0 bottom-0 w-1/3 z-20"
                        onClick={goPrevSegment}
                        aria-label="Previous segment"
                      />
                      <button
                        type="button"
                        className="absolute right-0 top-0 bottom-0 w-1/3 z-20"
                        onClick={goNextSegment}
                        aria-label="Next segment"
                      />
                    </>
                  )}

                  {mode === "media" ? (
                    activeSegment ? (
                      isVideo ? (
                        <>
                          <video
                            ref={previewVideoRef}
                            key={activeSegment.id}
                            src={activeSegment.url}
                            className="w-full h-full object-cover"
                            autoPlay
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              const durationSec = Number(e.currentTarget.duration || 0);
                              if (Number.isFinite(durationSec) && durationSec > 0) {
                                const ms = Math.min(Math.max(durationSec * 1000, 3000), 15000);
                                setVideoDurationMap((prev) => ({ ...prev, [activeSegment.id]: ms }));
                              }
                            }}
                          />
                          <div className="absolute left-3 bottom-3 px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-medium">
                            {isPreviewHeld ? "Preview paused" : "Hold to pause"}
                          </div>
                        </>
                      ) : (
                        <img src={activeSegment.url} alt="Story preview" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <div className="h-full w-full grid place-items-center bg-[radial-gradient(circle_at_10%_10%,hsl(var(--primary)/0.24),transparent_40%),radial-gradient(circle_at_90%_90%,hsl(var(--secondary)/0.2),transparent_40%)] text-center px-5">
                        <div>
                          <UploadCloud className="w-10 h-10 text-primary mx-auto mb-3" />
                          <p className="text-sm font-medium text-foreground">Your story preview</p>
                          <p className="text-xs text-muted-foreground mt-1">Upload a photo or video</p>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-center px-5" style={{ background: stylePreset.gradient }}>
                      <p className="text-white text-3xl font-bold leading-tight break-words">{textContent || "Type your story..."}</p>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground text-center mt-3">This is how your story appears to friends</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-muted/40 border border-border/60">
              <button
                type="button"
                className={`h-11 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 transition ${
                  mode === "media" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMode("media")}
              >
                <ImageIcon className="w-4 h-4" />
                Photo / Video
              </button>
              <button
                type="button"
                className={`h-11 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 transition ${
                  mode === "text" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMode("text")}
              >
                <Type className="w-4 h-4" />
                Text Story
              </button>
            </div>

            {mode === "media" ? (
              <div className="space-y-4">
                <label className="block rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 cursor-pointer hover:border-primary/50 transition">
                  <div className="text-center">
                    <UploadCloud className="w-8 h-8 text-primary mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">Drop media or click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, WEBP, MP4, MOV</p>
                  </div>
                  <Input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleAddMedia(e.target.files)}
                  />
                </label>

                {mediaItems.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Segments ({mediaItems.length}/12)</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {mediaItems.map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveSegmentIndex(idx)}
                          className={`relative w-16 h-24 rounded-xl overflow-hidden border ${idx === activeSegmentIndex ? "border-primary ring-1 ring-primary/30" : "border-border/70"}`}
                        >
                          {item.kind === "video" ? (
                            <video src={item.url} className="w-full h-full object-cover" muted />
                          ) : (
                            <img src={item.url} alt="Segment" className="w-full h-full object-cover" />
                          )}
                          <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/55 text-white">{idx + 1}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSegment(item.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleRemoveSegment(item.id);
                              }
                            }}
                            className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/55 text-white"
                          >
                            x
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Caption</label>
                  <Textarea
                    className="mt-1.5 rounded-xl min-h-[110px]"
                    placeholder="Write a caption..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value.slice(0, 220))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1 text-right">{caption.length}/220</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Story text</label>
                  <Textarea
                    className="mt-1.5 rounded-xl min-h-[120px]"
                    placeholder="Share what's on your mind..."
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value.slice(0, 300))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1 text-right">{textContent.length}/300</p>
                </div>

                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Palette className="w-3.5 h-3.5" />
                    Background style
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {STYLE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`h-14 rounded-xl border text-xs font-semibold text-white relative overflow-hidden ${
                          stylePreset.id === preset.id ? "border-primary ring-2 ring-primary/40" : "border-transparent"
                        }`}
                        style={{ background: preset.gradient }}
                        onClick={() => setStylePreset(preset)}
                      >
                        <span className="relative z-10 drop-shadow">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="rounded-xl px-5 bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--secondary)))] text-primary-foreground"
              >
                {submitting ? "Posting..." : "Share Story"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
