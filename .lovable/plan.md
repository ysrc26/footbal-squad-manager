

## הוספת יצירה ידנית ואוטומטית של משחקים

### סקירה כללית
המערכת תתמוך בשני סוגי משחקים:
1. **משחקי בדיקה** - נוצרים ידנית על ידי מנהל עם כל הפרמטרים הניתנים לעריכה
2. **משחקים שבועיים אוטומטיים** - נוצרים אוטומטית **ביום ראשון בבוקר** לשבת הקרובה לפי זמני שבת מ-Hebcal API

---

### שלב 1: עדכון סכמת בסיס הנתונים

נוסיף שדות חדשים לטבלת `games`:

```sql
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 15;
ALTER TABLE games ADD COLUMN IF NOT EXISTS max_standby INTEGER DEFAULT 10;
ALTER TABLE games ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS wave1_registration_opens_at TIMESTAMPTZ;
```

| שדה | תיאור | ברירת מחדל |
|-----|-------|-------------|
| `is_auto_generated` | האם נוצר אוטומטית | `false` |
| `max_players` | מקסימום שחקנים פעילים | `15` |
| `max_standby` | מקסימום ממתינים | `10` |
| `registration_opens_at` | מתי ההרשמה נפתחת לכולם (Wave 2) | - |
| `wave1_registration_opens_at` | מתי ההרשמה נפתחת לתושבים (Wave 1) | - |

---

### שלב 2: עדכון טיפוסי TypeScript

עדכון `src/lib/database.types.ts` עם השדות החדשים.

---

### שלב 3: טופס יצירת משחק ידני חדש

יצירת קומפוננטה חדשה `src/components/admin/CreateGameForm.tsx`:

**שדות הטופס:**
- תאריך משחק
- שעת התחלה (Kickoff)
- דד-ליין להרשמה
- מספר שחקנים מקסימלי (ברירת מחדל: 15)
- מספר ממתינים מקסימלי (ברירת מחדל: 10)
- פתיחת הרשמה לתושבים (Wave 1)
- פתיחת הרשמה לכולם (Wave 2)
- סטטוס התחלתי

```text
┌─────────────────────────────────────────┐
│  יצירת משחק חדש                         │
├─────────────────────────────────────────┤
│  תאריך:           [____________]        │
│  שעת התחלה:       [__:__]               │
│  דד-ליין:         [____________] [__:__] │
│                                         │
│  מקסימום שחקנים:     [15___]            │
│  מקסימום ממתינים:    [10___]            │
│                                         │
│  Wave 1 (תושבים):  [____________]        │
│  Wave 2 (כולם):    [____________]        │
│                                         │
│  סטטוס: [מתוכנן]                        │
│                                         │
│  [    צור משחק לבדיקה    ]              │
└─────────────────────────────────────────┘
```

---

### שלב 4: שילוב Hebcal API

יצירת `src/lib/hebcal.ts`:

```typescript
interface ShabbatTimes {
  date: string;           // תאריך שבת (YYYY-MM-DD)
  candleLighting: Date;   // הדלקת נרות
  havdalah: Date;         // הבדלה
}

// שליפת זמני שבת מ-Hebcal API לנחלים, ישראל
export async function getNextShabbatTimes(): Promise<ShabbatTimes>

// חישוב זמני משחק לפי שבת
export function calculateGameTimes(shabbatTimes: ShabbatTimes)
```

**Hebcal API:**
```text
URL: https://www.hebcal.com/shabbat
Parameters:
  - cfg=json (פורמט JSON)
  - geonameid=294071 (נחלים, ישראל)
  - M=on (זמני הבדלה)
```

---

### שלב 5: יצירה אוטומטית של משחקים

יצירת `src/lib/autoGameCreation.ts`:

**לוגיקת יצירה:**
1. בדוק אם כבר קיים משחק לשבת הקרובה
2. שלוף זמני שבת מ-Hebcal
3. חשב את כל הזמנים
4. צור משחק חדש

**לוגיקת זמנים אוטומטית:**
```text
יצירת משחק  = יום ראשון בבוקר (לפני פתיחת ההרשמה ביום שישי)
Wave 1 (תושבים) = יום שישי 12:00
Wave 2 (כולם)   = candle_lighting - 60 דקות
Deadline        = havdalah + 60 דקות (מעוגל לחצי שעה)
Kickoff         = deadline - 15 דקות
```

---

### שלב 6: עדכון ממשק ניהול המשחקים

עדכון `src/components/admin/GameManagement.tsx`:

```text
┌─────────────────────────────────────────┐
│  ניהול משחקים                           │
├─────────────────────────────────────────┤
│                                         │
│  [צור משחק ידני לבדיקה]                 │
│                                         │
│  [צור משחק אוטומטי (לפי זמני שבת)]      │
│                                         │
├─────────────────────────────────────────┤
│  משחקים קיימים                          │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐│
│  │ שבת 08/02 │ 18:45 │ פתוח │ [אוטו]  ││
│  │ 15/15 שחקנים  Wave2: פתוח          ││
│  │ [ערוך] [מחק]                       ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ שבת 15/02 │ 20:00 │ מתוכנן │ [בדיקה]││
│  │ 0/20 שחקנים (משחק בדיקה)           ││
│  │ [ערוך] [מחק]                       ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘

[אוטו] = משחק אוטומטי (לפי זמני שבת)
[בדיקה] = משחק בדיקה (הגדרות ידניות)
```

---

### שלב 7: עדכון GameRegistration

עדכון `src/components/game/GameRegistration.tsx`:
- שימוש ב-`max_players` מבסיס הנתונים במקום קבוע
- הצגת זמני פתיחת הרשמה
- לוגיקת `canRegister()` מעודכנת לפי הזמנים מהמשחק

---

### סיכום קבצים

| קובץ | פעולה |
|------|-------|
| `src/lib/database.types.ts` | עדכון טיפוסים |
| `src/lib/hebcal.ts` | **חדש** - שילוב Hebcal API |
| `src/lib/autoGameCreation.ts` | **חדש** - יצירה אוטומטית |
| `src/components/admin/CreateGameForm.tsx` | **חדש** - טופס יצירה ידנית |
| `src/components/admin/GameManagement.tsx` | עדכון ממשק |
| `src/components/game/GameRegistration.tsx` | תמיכה ב-max_players דינמי |

---

### תזמון יצירת משחקים

```text
יום ראשון בבוקר
        │
        ▼
  יצירת משחק אוטומטי לשבת הקרובה
        │
        ▼
  יום שישי 12:00 ──► Wave 1 נפתח (תושבים)
        │
        ▼
  הדלקת נרות - 60 דקות ──► Wave 2 נפתח (כולם)
        │
        ▼
  הבדלה + 60 דקות ──► דד-ליין (מעוגל ל-:00/:30)
        │
        ▼
  דד-ליין - 15 דקות ──► Kickoff
```

