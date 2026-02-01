

## תיקון שני באגים: הרשמה לא-תושבים ועריכת סטטוס תושבות

### סקירה

**בעיה 1: משתמש לא-תושב לא יכול להירשם**
הפונקציה `canRegister()` בודקת רק את השדה `status` של המשחק בבסיס הנתונים. כשיוצרים משחק עם סטטוס `open_for_residents`, הסטטוס לא מתעדכן אוטומטית ל-`open_for_all` כשמגיע זמן ה-Wave 2.

**בעיה 2: משתמש יכול לשנות סטטוס תושב בכל עת**
כרגע כל משתמש יכול להגדיר ולשנות את הסטטוס שלו כ"תושב" בכל זמן. הדרישה היא שמשתמש יוכל להגדיר זאת רק בפעם הראשונה (כשהפרופיל ריק), ואחרי זה רק מנהל יכול לשנות.

---

### פתרון בעיה 1: לוגיקת זמן ב-canRegister

עדכון הפונקציה `canRegister()` ב-`GameRegistration.tsx` לבדוק גם את הזמנים:

```typescript
const canRegister = () => {
  if (!currentGame) return false;
  
  const now = new Date();
  
  // בדיקה לפי זמני הרשמה מהמשחק
  if (currentGame.registration_opens_at) {
    const wave2Opens = new Date(currentGame.registration_opens_at);
    if (now >= wave2Opens) {
      // אחרי זמן Wave 2 - פתוח לכולם
      return true;
    }
  }
  
  if (currentGame.wave1_registration_opens_at) {
    const wave1Opens = new Date(currentGame.wave1_registration_opens_at);
    if (now >= wave1Opens && profile?.is_resident) {
      // אחרי זמן Wave 1 ולפני Wave 2 - פתוח לתושבים בלבד
      return true;
    }
  }
  
  // Fallback לסטטוס ישן (לתמיכה לאחור)
  if (currentGame.status === 'open_for_residents') {
    return profile?.is_resident === true;
  }
  
  return currentGame.status === 'open_for_all';
};
```

**עדכון הצגת הסטטוס בכפתור:**
גם הטקסט בכפתור צריך להתעדכן בהתאם לזמן הנוכחי ולא רק לסטטוס בבסיס הנתונים.

---

### פתרון בעיה 2: הגבלת עריכת סטטוס תושב

**עדכון `Profile.tsx`:**

הוספת לוגיקה לזהות אם זו הפעם הראשונה שהמשתמש מגדיר את הפרופיל:

```typescript
// בדיקה אם זו הגדרה ראשונה (פרופיל חדש)
const isFirstTimeSetup = !profile?.full_name;

// ב-JSX: הצגת מתג תושב רק בהגדרה ראשונה
{isFirstTimeSetup ? (
  <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
    <div className="flex items-center gap-3">
      <Home className="h-5 w-5 text-primary" />
      <div>
        <Label htmlFor="isResident" className="text-base font-medium cursor-pointer">
          תושב נחלים
        </Label>
        <p className="text-sm text-muted-foreground">
          תושבים מקבלים עדיפות בהרשמה
        </p>
      </div>
    </div>
    <Switch
      id="isResident"
      checked={isResident}
      onCheckedChange={setIsResident}
    />
  </div>
) : (
  // תצוגה בלבד - לא ניתן לשנות
  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
    <div className="flex items-center gap-3">
      <Home className="h-5 w-5 text-muted-foreground" />
      <div>
        <span className="text-base font-medium">תושב נחלים</span>
        <p className="text-sm text-muted-foreground">
          {profile?.is_resident ? 'כן' : 'לא'} - לשינוי פנה למנהל
        </p>
      </div>
    </div>
    <Badge variant={profile?.is_resident ? 'default' : 'secondary'}>
      {profile?.is_resident ? 'תושב' : 'לא תושב'}
    </Badge>
  </div>
)}
```

**עדכון `handleSave`:**
לא לשלוח את שדה `is_resident` אם זה לא הגדרה ראשונה.

---

### פתרון בעיה 2 (חלק ב): מנהל יכול לשנות סטטוס תושב

**עדכון `UserManagement.tsx`:**

הוספת מתג נוסף לכל משתמש לשינוי סטטוס תושב:

```typescript
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
    toast.error('שגיאה בעדכון סטטוס', { description: error.message });
  } finally {
    setUpdating(null);
  }
};
```

**עדכון ה-UI:**
הוספת מתג "תושב" ליד מתג "מנהל" בכל שורת משתמש.

---

### סיכום השינויים

| קובץ | שינוי |
|------|-------|
| `src/components/game/GameRegistration.tsx` | עדכון `canRegister()` לבדוק זמנים, לא רק סטטוס |
| `src/pages/Profile.tsx` | הסתרת מתג תושב לאחר הגדרה ראשונה |
| `src/components/admin/UserManagement.tsx` | הוספת יכולת למנהל לשנות סטטוס תושב |

---

### לוגיקת הרשמה חדשה

```text
זמן נוכחי >= registration_opens_at?
        │
    ┌───┴───┐
   כן       לא
    │        │
    ▼        ▼
כולם יכולים  זמן נוכחי >= wave1_registration_opens_at?
להירשם              │
             ┌──────┴──────┐
            כן             לא
             │              │
             ▼              ▼
      רק תושבים      אף אחד לא יכול
      יכולים         להירשם
```

