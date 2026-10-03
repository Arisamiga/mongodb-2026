import Link from "next/link";
import {MapPin, ArrowUpRight, CalendarDays} from "lucide-react";
import type {PublicItem} from "@/lib/types";
import {ItemPhoto} from "./item-photo";
export function ItemCard({item}: {item: PublicItem}) {
    return (
        <Link href={`/items/${item.id}`} className="item-card">
            <div className="item-image">
                <ItemPhoto src={item.imageUrl} alt={item.title} />
                <span className={`badge ${item.type.toLowerCase()}`}>
                    <i />
                    {item.type}
                </span>
                <span className="card-arrow">
                    <ArrowUpRight size={18} />
                </span>
            </div>
            <div className="item-content">
                <span className="eyebrow">{item.category}</span>
                <h3>{item.title}</h3>
                <p className="location">
                    <MapPin size={14} />
                    {item.location}
                </p>
                <div className="card-bottom">
                    <span>
                        <CalendarDays size={13} />
                        {new Date(
                            item.eventDate + "T12:00:00Z",
                        ).toLocaleDateString("en-IE", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                        })}
                    </span>
                    <span>
                        View details <ArrowUpRight size={13} />
                    </span>
                </div>
            </div>
        </Link>
    );
}
