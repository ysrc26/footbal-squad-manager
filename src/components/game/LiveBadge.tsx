"use client";

import { Badge } from '@/components/ui/badge';

export function LiveBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-2 border-green-500 bg-transparent px-3 py-1 text-white"
    >
      <span className="h-2 w-2 rounded-full bg-red-500 live-pulse" />
      LIVE
    </Badge>
  );
}
