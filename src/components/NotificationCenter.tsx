import { useState } from "react";
import { Bell, Check, CheckCheck, Trash2, Clock, AlertTriangle, UserPlus, X, AtSign, EyeOff, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications, Notification, NotificationType } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const notificationIcons: Record<NotificationType, React.ReactNode> = {
  assignment: <UserPlus className="w-4 h-4 text-blue-500" />,
  due_soon: <Clock className="w-4 h-4 text-amber-500" />,
  overdue: <AlertTriangle className="w-4 h-4 text-destructive" />,
  assignment_changed: <UserPlus className="w-4 h-4 text-blue-500" />,
  assignment_removed: <X className="w-4 h-4 text-muted-foreground" />,
  mention: <AtSign className="w-4 h-4 text-primary" />,
  profile_incomplete: <UserCircle className="w-4 h-4 text-amber-500" />,
};

function NotificationItem({ 
  notification, 
  onMarkRead, 
  onMarkUnread,
  onDelete,
  onClick,
}: { 
  notification: Notification;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: (notification: Notification) => void;
}) {
  const isPersistent = notification.persistent;

  return (
    <div 
      className={cn(
        "group flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer border-b last:border-b-0",
        !notification.is_read && "bg-blue-50/50 dark:bg-blue-950/20",
        isPersistent && "bg-amber-50/50 dark:bg-amber-950/20"
      )}
      onClick={() => {
        if (!isPersistent && !notification.is_read) {
          onMarkRead(notification.id);
        }
        onClick?.(notification);
      }}
    >
      <div className="mt-0.5">
        {notificationIcons[notification.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", !notification.is_read && "text-foreground")}>
            {notification.title}
          </span>
          {!notification.is_read && (
            <div className={cn("w-2 h-2 rounded-full", isPersistent ? "bg-amber-500" : "bg-blue-500")} />
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        {!isPersistent && (
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
          </p>
        )}
      </div>
      {!isPersistent && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {notification.is_read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Mark as unread"
              onClick={(e) => {
                e.stopPropagation();
                onMarkUnread(notification.id);
              }}
            >
              <EyeOff className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(notification.id);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

interface NotificationCenterProps {
  onNotificationClick?: (notification: Notification) => void;
}

export function NotificationCenter({ onNotificationClick }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const { 
    notifications, 
    unreadCount, 
    loading,
    markAsRead, 
    markAsUnread,
    markAllAsRead, 
    deleteNotification,
    clearAll,
  } = useNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center p-0 px-0.5 text-[10px] leading-none"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold text-sm">Notifications</h4>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs"
                onClick={markAllAsRead}
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs text-muted-foreground"
                onClick={clearAll}
              >
                Clear all
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                No notifications
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={markAsRead}
                  onMarkUnread={markAsUnread}
                  onDelete={deleteNotification}
                  onClick={(n) => { onNotificationClick?.(n); setOpen(false); }}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
