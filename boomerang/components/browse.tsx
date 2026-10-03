"use client";
import {useEffect, useState} from "react";
import {Search, SlidersHorizontal, ArrowRight, X} from "lucide-react";
import Link from "next/link";
import {categories, type PublicItem} from "@/lib/types";
import {ItemCard} from "./item-card";
export function Browse() {
    const [q, setQ] = useState("");
    const [type, setType] = useState("");
    const [category, setCategory] = useState("");
    const [items, setItems] = useState<PublicItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        const timeout = setTimeout(async () => {
            setError("");
            try {
                const res = await fetch(
                    `/api/items?${new URLSearchParams({q, type, category})}`,
                    {signal: controller.signal},
                );
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setItems(data.items);
            } catch (e) {
                if (!controller.signal.aborted) setError((e as Error).message);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 250);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [q, type, category, retry]);
    return (
        <>
            <div className="filters">
                <label className="search-box">
                    <Search size={19} />
                    <input
                        aria-label="Search items"
                        placeholder="Search an item, description, or location…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    {q && (
                        <button
                            onClick={() => setQ("")}
                            aria-label="Clear search"
                        >
                            <X size={16} />
                        </button>
                    )}
                </label>
                <label className="category-filter">
                    <SlidersHorizontal size={17} />
                    <select
                        aria-label="Category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                    >
                        <option value="">All categories</option>
                        {categories.map((c) => (
                            <option key={c}>{c}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="results-toolbar">
                <div className="tabs">
                    {[
                        ["", "All items"],
                        ["LOST", "Lost"],
                        ["FOUND", "Found"],
                    ].map(([value, label]) => (
                        <button
                            key={value}
                            className={type === value ? "selected" : ""}
                            aria-pressed={type === value}
                            onClick={() => setType(value)}
                        >
                            {value && <i className={value.toLowerCase()} />}{" "}
                            {label}
                        </button>
                    ))}
                </div>
                <span aria-live="polite">
                    {loading
                        ? "Looking around…"
                        : `${items.length} ${items.length === 1 ? "item" : "items"}`}
                </span>
            </div>
            {error ? (
                <div className="empty-state" role="alert">
                    <h3>We couldn’t load the board.</h3>
                    <p>{error}</p>
                    <button
                        className="button secondary"
                        onClick={() => setRetry(retry + 1)}
                    >
                        Try again
                    </button>
                </div>
            ) : loading ? (
                <div className="item-grid" aria-label="Loading items">
                    {[1, 2, 3].map((n) => (
                        <div key={n} className="skeleton" />
                    ))}
                </div>
            ) : items.length ? (
                <div className="item-grid">
                    {items.map((item) => (
                        <ItemCard item={item} key={item.id} />
                    ))}
                </div>
            ) : (
                <div className="empty-state">
                    <Search size={34} />
                    <h3>No items found just yet.</h3>
                    <p>Try a broader search or share your own report.</p>
                    <button
                        className="button secondary"
                        onClick={() => {
                            setQ("");
                            setCategory("");
                            setType("");
                        }}
                    >
                        Clear filters
                    </button>
                    <Link className="text-link" href="/report">
                        Report an item <ArrowRight size={16} />
                    </Link>
                </div>
            )}
        </>
    );
}
