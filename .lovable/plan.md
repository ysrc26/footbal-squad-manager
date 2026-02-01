

## תיקון הרשמה חוזרת אחרי ביטול

### הבעיה
כשמשתמש מבטל הרשמה, הרשומה נשארת בבסיס הנתונים עם סטטוס `cancelled`. כשהוא מנסה להירשם שוב, הקוד מנסה ליצור רשומה חדשה אבל נתקל ב-constraint ייחודי על `(user_id, game_id)`.

### הפתרון
במקום לנסות ליצור רשומה חדשה, נבדוק אם כבר קיימת הרשמה (כולל מבוטלת) ונעדכן אותה.

### שינויים נדרשים

**קובץ: `src/components/game/GameRegistration.tsx`**

**1. הוספת שאילתה נפרדת לבדיקת הרשמה קודמת של המשתמש:**

נוסיף פונקציה שבודקת אם יש הרשמה קיימת (כולל מבוטלת):

```typescript
const checkExistingRegistration = async () => {
  if (!currentGame || !user) return null;
  
  const { data } = await supabase
    .from('registrations')
    .select('*')
    .eq('game_id', currentGame.id)
    .eq('user_id', user.id)
    .maybeSingle();
    
  return data;
};
```

**2. עדכון פונקציית `handleRegister`:**

במקום רק INSERT, נבדוק קודם אם יש הרשמה קודמת:

```typescript
const handleRegister = async () => {
  if (!currentGame || !user || !canRegister()) return;

  setRegistering(true);
  try {
    const activeCount = registrations.filter((r) => r.status === 'active').length;
    const newStatus = activeCount < MAX_ACTIVE_PLAYERS ? 'active' : 'standby';

    // בדיקה אם יש הרשמה קיימת (כולל מבוטלת)
    const existingReg = await checkExistingRegistration();

    if (existingReg) {
      // עדכון הרשמה קיימת במקום יצירת חדשה
      const { error } = await supabase
        .from('registrations')
        .update({ 
          status: newStatus, 
          check_in_status: 'pending',
          updated_at: new Date().toISOString() 
        })
        .eq('id', existingReg.id);

      if (error) throw error;
    } else {
      // יצירת הרשמה חדשה
      const { error } = await supabase.from('registrations').insert({
        game_id: currentGame.id,
        user_id: user.id,
        status: newStatus,
        check_in_status: 'pending',
      });

      if (error) throw error;
    }

    toast.success(
      newStatus === 'active'
        ? 'נרשמת בהצלחה! 🎉'
        : 'נוספת לרשימת ההמתנה 📝'
    );
    fetchRegistrations();
  } catch (error: any) {
    toast.error('שגיאה בהרשמה', { description: error.message });
  } finally {
    setRegistering(false);
  }
};
```

### סיכום השינויים
| קובץ | שינוי |
|------|-------|
| `GameRegistration.tsx` | הוספת פונקציית `checkExistingRegistration` |
| `GameRegistration.tsx` | עדכון `handleRegister` לטפל בהרשמה חוזרת |

