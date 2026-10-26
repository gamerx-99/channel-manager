import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCircle2 } from "lucide-react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface NotificationBellProps {
  hotelId?: string | null;
}

export default function NotificationBell({ hotelId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveHotelId = hotelId ?? undefined;
  const utils = trpc.useUtils();
  const { data: notifications = [], isLoading } = trpc.notifications.list.useQuery(
    { hotelId: effectiveHotelId },
    { refetchInterval: 30000 }
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate({ hotelId: effectiveHotelId });
    }
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate({ hotelId: effectiveHotelId });
      toast.success("All notifications marked as read");
    }
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="dropdown-anchor" ref={containerRef}>
      <button
        className="icon-button bordered topbar-notifications"
        aria-label="การแจ้งเตือน"
        onClick={() => setOpen(!open)}
      >
        <Bell size={16} />
        {unreadCount > 0 && <i aria-hidden="true" />}
      </button>

      {open && (
        <div className="menu-surface menu-surface--topbar notification-menu">
          <div className="notif-menu-header">
            <strong className="notif-menu-title">Notifications</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-all"
                onClick={() => markAllRead.mutate({ hotelId: effectiveHotelId })}
                disabled={markAllRead.isPending}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="notif-menu-body">
            {isLoading ? (
              <div className="notif-menu-empty">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="notif-menu-empty notif-menu-caught-up">
                <CheckCircle2 size={28} aria-hidden="true" />
                You're all caught up!
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item${n.is_read ? "" : " notif-item--unread"}`}
                >
                  <div className="notif-item-body">
                    <p className="notif-item-message">{n.message}</p>
                    <span className="notif-item-time">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {!n.is_read && effectiveHotelId && (
                    <button
                      type="button"
                      className="icon-button"
                      title="Mark as read"
                      aria-label="Mark as read"
                      onClick={() => markRead.mutate({ hotelId: effectiveHotelId, notificationId: n.id })}
                      disabled={markRead.isPending}
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
