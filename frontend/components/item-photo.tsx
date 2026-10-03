"use client";
import {useState} from "react";
import {Package} from "lucide-react";
export function ItemPhoto({src, alt}: {src: string; alt: string}) {
    const [failed, setFailed] = useState(false);
    return src && !failed ? (
        <img
            src={src}
            alt={alt}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
        />
    ) : (
        <div className="image-placeholder">
            <Package size={48} />
            <span>{failed ? "Photo unavailable" : "No photo provided"}</span>
        </div>
    );
}
