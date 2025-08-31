"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { collection, onSnapshot, orderBy, query, updateDoc, doc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function NotificationBell({ user, role }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!user || !role) return;
    // HR/Manager: listen to role-based notifications; Applicant: userId notifications
    const base = collection(db, "notifications");
    const q = role === "employee" || role === "applicant"
      ? query(base, where("userId", "==", user.uid), orderBy("createdAt", "desc"))
      : query(base, where("audienceRoles", "array-contains", role), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(list);
    });
    return () => unsub();
  }, [user, role]);

  const unreadCount = useMemo(() => {
    if (!user) return 0;
    return items.filter((n) => !(n.readBy || []).includes(user.uid)).length;
  }, [items, user]);

  const markRead = async (id) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "notifications", id), {
        readBy: [...new Set([...(items.find(i=>i.id===id)?.readBy || []), user.uid])],
      });
    } catch (e) {
      console.error("Failed to mark read", e);
    }
  };

  const markAllRead = async () => {
    for (const n of items) await markRead(n.id);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100" aria-label="Notifications">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] leading-none px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] max-h-[480px] overflow-auto">
        <div className="px-2 py-1 text-sm font-medium flex items-center justify-between">
          <span>Notifications</span>
          <button onClick={markAllRead} className="text-[#2b99ff] text-xs">Mark all as read</button>
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <div className="px-3 py-6 text-sm text-gray-500">No notifications</div>
        )}
        {items.map((n) => (
          <DropdownMenuItem key={n.id} onSelect={() => markRead(n.id)} className="flex flex-col items-start gap-1">
            <div className="w-full flex items-center justify-between gap-2">
              <div className="text-sm font-medium truncate">
                {n.type === "apps_summary" ? "New applications summary" : n.title || "Notification"}
              </div>
              {!(n.readBy || []).includes(user?.uid) && <span className="h-2 w-2 rounded-full bg-[#2b99ff]" />}
            </div>
            <div className="text-xs text-gray-600 w-full whitespace-pre-wrap">
              {n.type === "apps_summary" && Array.isArray(n.items)
                ? n.items.map(it => `• ${it.title}: ${it.count}`).join("\n")
                : (n.message || "")}
            </div>
            <div className="text-[10px] text-gray-400">{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : ''}</div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


