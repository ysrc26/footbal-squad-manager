"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, FileText, Save, Eye, Edit3 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function RulesEditor() {
  const [rulesContent, setRulesContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('id, rules_content')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettingsId(data.id);
        setRulesContent(data.rules_content || getDefaultRules());
        setOriginalContent(data.rules_content || '');
      } else {
        setRulesContent(getDefaultRules());
      }
    } catch (error: any) {
      toast.error('שגיאה בטעינת החוקים', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const getDefaultRules = () => `# חוקי משחק כדורגל נחלים

## כללי
- המשחק מתקיים כל שבת מוצ"ש
- משך המשחק: כשעה וחצי
- מספר שחקנים: עד 20 שחקנים (10 בכל קבוצה)

## הרשמה
- הרשמה נפתחת במוצאי שבת
- תושבי נחלים מקבלים עדיפות ב-2 השעות הראשונות
- לאחר מכן ההרשמה פתוחה לכולם
- יש לבטל הרשמה לפחות שעתיים לפני המשחק

## צ'ק-אין
- יש לבצע צ'ק-אין באמצעות סריקת QR במגרש
- צ'ק-אין אפשרי רק ברדיוס 10 מטר מהמגרש
- שחקן שלא מגיע 3 פעמים ללא ביטול יושעה

## התנהגות
- שמירה על כבוד הדדי
- אין אלימות מילולית או פיזית
- שמירה על ניקיון המגרש

## קבוצות
- חלוקה אקראית לקבוצות
- החלפות בין מחציות לפי שיקול דעת

בהצלחה ותהנו! ⚽`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData = {
        rules_content: rulesContent,
        updated_at: new Date().toISOString(),
      };

      if (settingsId) {
        const { error } = await supabase
          .from('app_settings')
          .update(updateData)
          .eq('id', settingsId);

        if (error) throw error;
      } else {
        // Need to create settings first with a QR key
        const { error } = await supabase
          .from('app_settings')
          .insert({
            ...updateData,
            qr_secret_key: 'placeholder-key-please-update-in-settings',
          });

        if (error) throw error;
      }

      setOriginalContent(rulesContent);
      toast.success('החוקים נשמרו בהצלחה!');
    } catch (error: any) {
      toast.error('שגיאה בשמירת החוקים', {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = rulesContent !== originalContent;

  // Parse inline bold text **text** -> <strong>
  const parseInlineStyles = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  // Simple markdown renderer for preview
  const renderMarkdown = (text: string) => {
    return text
      .split('\n')
      .map((line, index) => {
        // Headers
        if (line.startsWith('# ')) {
          return <h1 key={index} className="text-2xl font-bold mb-4 text-primary">{parseInlineStyles(line.slice(2))}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={index} className="text-xl font-bold mt-6 mb-3">{parseInlineStyles(line.slice(3))}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={index} className="text-lg font-semibold mt-4 mb-2">{parseInlineStyles(line.slice(4))}</h3>;
        }
        // List items
        if (line.startsWith('- ')) {
          return (
            <li key={index} className="mr-4 mb-1 list-disc list-inside">
              {parseInlineStyles(line.slice(2))}
            </li>
          );
        }
        // Empty lines
        if (line.trim() === '') {
          return <br key={index} />;
        }
        // Regular paragraphs
        return <p key={index} className="mb-2">{parseInlineStyles(line)}</p>;
      });
  };

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
            <FileText className="h-5 w-5 text-primary" />
            עריכת חוקי המשחק
          </CardTitle>
          <CardDescription>
            ערוך את תוכן החוקים שמוצגים לשחקנים (תומך בפורמט Markdown)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="edit" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="edit" className="gap-2">
                <Edit3 className="h-4 w-4" />
                עריכה
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2">
                <Eye className="h-4 w-4" />
                תצוגה מקדימה
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="mt-0">
              <Textarea
                value={rulesContent}
                onChange={(e) => setRulesContent(e.target.value)}
                placeholder="הזן את חוקי המשחק כאן..."
                className="min-h-[400px] font-mono text-sm leading-relaxed"
                dir="rtl"
              />
              <div className="mt-2 text-xs text-muted-foreground">
                <p>טיפים לעיצוב:</p>
                <ul className="mr-4 mt-1 space-y-1">
                  <li><code className="bg-muted px-1 rounded"># כותרת ראשית</code></li>
                  <li><code className="bg-muted px-1 rounded">## כותרת משנית</code></li>
                  <li><code className="bg-muted px-1 rounded">- פריט ברשימה</code></li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-0">
              <div className="min-h-[400px] p-4 rounded-lg bg-secondary/30 overflow-y-auto">
                {renderMarkdown(rulesContent)}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        className="w-full h-12 text-lg font-semibold neon-glow"
        onClick={handleSave}
        disabled={saving || !hasChanges}
      >
        {saving ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Save className="h-5 w-5 ml-2" />
            {hasChanges ? 'שמור שינויים' : 'אין שינויים לשמור'}
          </>
        )}
      </Button>
    </div>
  );
}
