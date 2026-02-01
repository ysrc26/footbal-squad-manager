import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle2 } from 'lucide-react';
import type { Tables } from '@/lib/database.types';

type Registration = Tables<'registrations'> & {
  full_name: string | null;
};

interface PlayerListProps {
  title: string;
  players: Registration[];
  maxPlayers?: number;
  showPosition?: boolean;
  emptyMessage: string;
}

export function PlayerList({ title, players, maxPlayers, showPosition, emptyMessage }: PlayerListProps) {
  return (
    <Card className="glass animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {title}
          </div>
          <Badge variant="secondary">
            {players.length}{maxPlayers && `/${maxPlayers}`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {players.map((registration, index) => (
              <div
                key={registration.id}
                className="flex items-center justify-between p-2 rounded-lg bg-secondary/30"
              >
                <div className="flex items-center gap-3">
                  {showPosition && (
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                      {index + 1}
                    </span>
                  )}
                  <span className="font-medium text-sm">
                    {registration.full_name || 'שחקן אנונימי'}
                  </span>
                </div>
                {registration.check_in_status === 'checked_in' && (
                  <Badge className="bg-green-500/20 text-green-500 border-green-500/50 text-xs">
                    <CheckCircle2 className="h-3 w-3 ml-1" />
                    צ'ק-אין
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
