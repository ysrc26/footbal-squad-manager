

## הוספת תמונת פרופיל ושינוי טרמינולוגיה (מעודכן)

### סקירה כללית

1. **העלאת תמונת פרופיל** - אפשרות למשתמש להעלות תמונה בדף הפרופיל
2. **שינוי טרמינולוגיה** - שינוי כותרת הרשימה בלבד ל"מזמינים"

---

### שלב 1: יצירת Bucket ב-Supabase Storage

יש להריץ את ה-SQL הבא ב-Supabase SQL Editor:

```sql
-- יצירת bucket לתמונות פרופיל
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- מדיניות לאפשר למשתמשים להעלות תמונות משלהם
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- מדיניות לאפשר למשתמשים לעדכן תמונות משלהם
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- מדיניות לאפשר לכולם לצפות בתמונות (bucket ציבורי)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- מדיניות לאפשר למשתמשים למחוק תמונות משלהם
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

### שלב 2: עדכון דף הפרופיל

עדכון `src/pages/Profile.tsx`:

**תוספות:**
- תצוגת תמונת הפרופיל הנוכחית (עיגול גדול)
- כפתור "שנה תמונה" עם אייקון מצלמה
- Input מוסתר לבחירת קובץ
- פונקציית העלאה ל-Supabase Storage

```text
┌─────────────────────────────────────────┐
│                                         │
│         ┌───────────────┐               │
│         │    תמונה      │               │
│         │   (עיגול)     │               │
│         └───────────────┘               │
│         [📷 שנה תמונה]                  │
│                                         │
│  שם מלא:        [____________]          │
│  טלפון:         [+972...]               │
│  תושב נחלים:    [כן/לא]                 │
│                                         │
│  [       שמור שינויים       ]           │
└─────────────────────────────────────────┘
```

---

### שלב 3: הצגת תמונת פרופיל בדשבורד

עדכון `src/pages/Dashboard.tsx`:

שינוי האייקון הגנרי לתמונת הפרופיל של המשתמש (אם קיימת):

```typescript
{profile?.avatar_url ? (
  <img 
    src={profile.avatar_url} 
    alt="תמונת פרופיל"
    className="w-12 h-12 rounded-full object-cover"
  />
) : (
  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
    <User className="w-6 h-6 text-primary" />
  </div>
)}
```

---

### שלב 4: הצגת תמונות פרופיל ברשימת השחקנים

עדכון `src/components/game/PlayerList.tsx`:

- הוספת `avatar_url` לטיפוס Registration
- הצגת תמונת פרופיל ליד כל שחקן (כשלא מוצג מספר מיקום)

---

### שלב 5: עדכון שליפת הפרופילים ב-GameRegistration

עדכון `src/components/game/GameRegistration.tsx`:

הוספת `avatar_url` לשליפת הפרופילים והעברתה ל-PlayerList.

---

### שלב 6: שינוי טרמינולוגיה (מצומצם)

עדכון רק בקומפוננטת PlayerList:

```typescript
<PlayerList
  title="מזמינים"           // לפני: "רשימת המתנה"
  players={standbyRegistrations}
  showPosition
  emptyMessage="אין מזמינים"  // לפני: "אין שחקנים בהמתנה"
/>
```

**לא** משנים את:
- הודעות ה-toast
- טקסט הסטטוס "אתה ברשימת ההמתנה"
- טקסט "מיקום ברשימת ההמתנה"

---

### סיכום השינויים

| קובץ | שינוי |
|------|-------|
| **SQL Migration** | יצירת bucket `avatars` + policies |
| `src/pages/Profile.tsx` | הוספת העלאת תמונה |
| `src/pages/Dashboard.tsx` | הצגת תמונת פרופיל |
| `src/components/game/PlayerList.tsx` | הוספת תמונות שחקנים + עדכון Type |
| `src/components/game/GameRegistration.tsx` | שליפת avatar_url + שינוי כותרת PlayerList בלבד |

