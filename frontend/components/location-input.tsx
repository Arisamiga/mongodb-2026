"use client";
import {useEffect, useId, useRef, useState} from "react";
import {LoaderCircle, MapPin} from "lucide-react";

export type Place = {
    id: string;
    label: string;
    primary: string;
    secondary: string;
    coordinates: [number, number];
};

export function LocationInput({label}: {label: string}) {
    const listId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");
    const [selected, setSelected] = useState<Place | null>(null);
    const [results, setResults] = useState<Place[]>([]);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        inputRef.current?.setCustomValidity(selected ? "" : "Choose a location from the suggestions.");
    }, [selected]);

    useEffect(() => {
        const query = text.trim();
        if (selected || query.length < 3) {
            setResults([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/places?text=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setResults(data.results);
                setError("");
                setActive(-1);
                setOpen(true);
            } catch (e) {
                if (controller.signal.aborted) return;
                setResults([]);
                setError(e instanceof Error && e.message ? e.message : "Location search is unavailable.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 300);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [text, selected]);

    function choose(place: Place) {
        setSelected(place);
        setText(place.label);
        setOpen(false);
        setResults([]);
    }

    function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (!open || results.length === 0) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => (i + 1) % results.length);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
        } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            choose(results[active]);
        } else if (event.key === "Escape") {
            setOpen(false);
        }
    }

    const showList = open && text.trim().length >= 3 && !selected && !error;

    return (
        <div className="location-field">
            <label>
                {label}
                <span className="location-input">
                    <MapPin size={17} aria-hidden="true" />
                    <input
                        ref={inputRef}
                        required
                        role="combobox"
                        aria-expanded={showList}
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                        autoComplete="off"
                        maxLength={160}
                        placeholder="Start typing an address or place"
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            setSelected(null);
                        }}
                        onKeyDown={onKeyDown}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setOpen(false)}
                    />
                    {loading && <LoaderCircle size={17} className="spin" aria-label="Searching" />}
                </span>
            </label>
            {showList && (
                <ul className="location-results" id={listId} role="listbox">
                    {results.length === 0 ? (
                        <li className="location-empty">{loading ? "Searching…" : "No matching places found."}</li>
                    ) : (
                        results.map((place, i) => (
                            <li
                                key={place.id}
                                id={`${listId}-${i}`}
                                role="option"
                                aria-selected={i === active}
                                className={i === active ? "active" : undefined}
                                // mousedown fires before the input's blur closes the list
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    choose(place);
                                }}
                            >
                                <strong>{place.primary}</strong>
                                {place.secondary && <span>{place.secondary}</span>}
                            </li>
                        ))
                    )}
                </ul>
            )}
            {error && <small className="location-error" role="alert">{error}</small>}
            <input type="hidden" name="location" value={selected?.label ?? ""} />
            <input type="hidden" name="longitude" value={selected?.coordinates[0] ?? ""} />
            <input type="hidden" name="latitude" value={selected?.coordinates[1] ?? ""} />
        </div>
    );
}
