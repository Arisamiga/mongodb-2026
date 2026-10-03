"use client";
import {useEffect, useState} from "react";
import {Search, SlidersHorizontal, ArrowRight, X} from "lucide-react";
import Link from "next/link";
import {categories, type Item} from "@/lib/types";
import {findItems} from "@/lib/store";
import {ItemCard} from "./item-card";
export function Browse({searchOnly = false}: {searchOnly?: boolean}) {
    const [q, setQ] = useState("");
    const [type, setType] = useState("");
    const [category, setCategory] = useState("");
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const canSearch = !searchOnly || q.trim().length >= 3;

    useEffect(() => {
        const timeout = setTimeout(() => {
            setItems(canSearch ? findItems({q, type, category}) : []);
            setLoading(false);
        }, 200);
        return () => clearTimeout(timeout);
    }, [q, type, category, canSearch]);
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
                        ["", searchOnly ? "Lost & found" : "All items"],
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
                    {!canSearch ? "Enter at least 3 characters" : loading
                        ? "Looking around…"
                        : `${items.length} ${items.length === 1 ? "item" : "items"}`}
                </span>
            </div>
            {!canSearch ? (
                <div className="empty-state">
                    <Search size={34} />
                    <h3>What are you looking for?</h3>
                    <p>Enter at least 3 characters describing your item or its location to see matching reports.</p>
                </div>
            ) : loading ? (
                <div className="item-grid" aria-label="Loading items">
                    {[1, 2, 3].map((n) => <div key={n} className="skeleton" />)}
                </div>
            ) : items.length ? (
                <div className="item-grid">
                    {items.map((item) => <ItemCard item={item} key={item.id} />)}
                </div>
            ) : (
                <div className="empty-state">
                    <Search size={34} />
                    <h3>No items found just yet.</h3>
                    <p>Try a broader search or share your own report.</p>
                    <button className="button secondary" onClick={() => { setQ(""); setCategory(""); setType(""); }}>
                        Clear filters
                    </button>
                    <Link className="text-link" href="/report">Report an item <ArrowRight size={16} /></Link>
                </div>
            )}
        </>
    );
}
