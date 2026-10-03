"use client";

import {useRef, useState} from "react";
import {ImagePlus, X} from "lucide-react";

async function preparePhoto(file: File): Promise<string> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Choose JPG, PNG or WebP photos.");
    }
    if (file.size > 5 * 1024 * 1024) throw new Error("Each photo must be under 5 MB.");
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser could not prepare your photo.");
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        // Keep browser-local reports small and strip image metadata.
        const data = canvas.toDataURL("image/jpeg", 0.8);
        if (data.length > 700_000) throw new Error("This photo is too detailed. Try a smaller image.");
        return data;
    } finally {
        URL.revokeObjectURL(url);
    }
}

export function PhotoInput({photos, onChange, onBusy}: {
    photos: string[];
    onChange: (photos: string[]) => void;
    onBusy: (busy: boolean) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const working = useRef(false);
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState("");

    async function add(files: File[]) {
        if (working.current || !files.length) return;
        setError("");
        if (files.length + photos.length > 3) {
            setError("You can add up to 3 photos. Remove one before adding more.");
            return;
        }
        working.current = true;
        setBusy(true);
        onBusy(true);
        try {
            const added = [];
            for (const file of files) added.push(await preparePhoto(file));
            onChange([...photos, ...added]);
        } catch (e) {
            setError(e instanceof Error && e.name !== "EncodingError"
                ? e.message : "This photo could not be opened. Choose a different image.");
        } finally {
            working.current = false;
            setBusy(false);
            onBusy(false);
        }
    }

    return (
        <section className="photo-field" aria-label="Photos (optional)">
            <p className="photo-heading">Photos <span className="optional">(optional)</span></p>
            <div
                className={`photo-dropzone ${dragging ? "dragging" : ""}`}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    void add(Array.from(event.dataTransfer.files));
                }}
            >
                <ImagePlus size={30} aria-hidden="true" />
                <strong>Give your item a familiar face</strong>
                <span>Drag and drop your photos here, or</span>
                <button type="button" className="button photo-add" disabled={busy || photos.length >= 3}
                    onClick={() => input.current?.click()}>
                    <ImagePlus size={18} /> {busy ? "Preparing photos…" : "Add photos"}
                </button>
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                    aria-label="Choose photos"
                    onChange={(event) => {
                        void add(Array.from(event.target.files ?? []));
                        event.target.value = "";
                    }} />
                <small>Up to 3 photos · JPG, PNG or WebP · 5 MB each</small>
            </div>
            <div className="photo-previews">
                {photos.map((photo, index) => (
                    <div className="photo-preview" key={`${index}-${photo.length}`}>
                        <img src={photo} alt={`Selected item photo ${index + 1}`} />
                        <button type="button" disabled={busy} aria-label={`Remove photo ${index + 1}`}
                            onClick={() => onChange(photos.filter((_, i) => i !== index))}>
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
            <p role="status" className="photo-status">{busy ? "Preparing photos…" : photos.length ? `${photos.length} of 3 photos added` : "Photos stay in this browser with your report. Avoid IDs or personal details."}</p>
            {error && <p role="alert" className="error-message">{error}</p>}
        </section>
    );
}
