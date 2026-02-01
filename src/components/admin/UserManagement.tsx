import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Users, Shield, Home, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { AppRole } from '@/lib/database.types';

interface UserWithRole {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  is_resident: boolean;
  isAdmin: boolean;
}

export function UserManagement() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number, is_resident')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all admin roles
      const { data: adminRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin' as AppRole);

      if (rolesError) throw rolesError;

      const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);

      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => ({
        id: profile.id,
        full_name: profile.full_name,
        phone_number: profile.phone_number,
        is_resident: profile.is_resident,
        isAdmin: adminUserIds.has(profile.id),
      }));

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast.error('שגיאה בטעינת המשתמשים', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleAdminRole = async (userId: string, currentIsAdmin: boolean) => {
    setUpdating(userId);
    try {
      if (currentIsAdmin) {
        // Remove admin role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'admin' as AppRole);

        if (error) throw error;
        toast.success('הרשאת מנהל הוסרה');
      } else {
        // Add admin role
        const { error } = await supabase
          .from('user_roles')
          .insert({
            user_id: userId,
            role: 'admin' as AppRole,
          });

        if (error) throw error;
        toast.success('הרשאת מנהל ניתנה');
      }

      // Update local state
      setUsers(prev =>
        prev.map(user =>
          user.id === userId ? { ...user, isAdmin: !currentIsAdmin } : user
        )
      );
    } catch (error: any) {
      toast.error('שגיאה בעדכון הרשאות', {
        description: error.message,
      });
    } finally {
      setUpdating(null);
    }
  };

  const toggleResidentStatus = async (userId: string, currentIsResident: boolean) => {
    setUpdating(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          is_resident: !currentIsResident,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;
      toast.success(currentIsResident ? 'סטטוס תושב הוסר' : 'סטטוס תושב ניתן');

      // Update local state
      setUsers(prev =>
        prev.map(user =>
          user.id === userId ? { ...user, is_resident: !currentIsResident } : user
        )
      );
    } catch (error: any) {
      toast.error('שגיאה בעדכון סטטוס', {
        description: error.message,
      });
    } finally {
      setUpdating(null);
    }
  };

  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(query) ||
      user.phone_number?.includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            ניהול משתמשים
            <Badge variant="secondary" className="mr-2">
              {users.length} משתמשים
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם או טלפון..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
            />
          </div>

          {/* User List */}
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                לא נמצאו משתמשים
              </p>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      {user.isAdmin ? (
                        <Shield className="h-5 w-5 text-primary" />
                      ) : (
                        <Users className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {user.full_name || 'משתמש ללא שם'}
                      </p>
                      <p className="text-sm text-muted-foreground" dir="ltr">
                        {user.phone_number || 'אין מספר טלפון'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {user.is_resident && (
                        <Badge variant="outline" className="border-primary/50 text-primary">
                          <Home className="h-3 w-3 ml-1" />
                          תושב
                        </Badge>
                      )}
                      {user.isAdmin && (
                        <Badge className="bg-primary/20 text-primary border border-primary">
                          מנהל
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">תושב</span>
                      {updating === user.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Switch
                          checked={user.is_resident}
                          onCheckedChange={() => toggleResidentStatus(user.id, user.is_resident)}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">מנהל</span>
                      {updating === user.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Switch
                          checked={user.isAdmin}
                          onCheckedChange={() => toggleAdminRole(user.id, user.isAdmin)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
