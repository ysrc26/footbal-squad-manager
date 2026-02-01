

## תיקון מערכת ההרשמה - הצגת סטטוס נכון ובקרת צ'ק-אין

### הבעיה המזוהה
בשאילתת ה-Supabase יש ניסיון לעשות JOIN עם טבלת `profiles` דרך `.select('*, profiles(full_name)')`, אבל אין קשר מפתח זר (Foreign Key) מוגדר בבסיס הנתונים בין `registrations.user_id` ל-`profiles.id`. זה גורם לשגיאה 400 וכל הרשימות חוזרות ריקות - גם אם המשתמש נרשם בפועל.

### הפתרון

**חלק 1: תיקון שאילתת ההרשמות (קריטי)**
- לשנות את `fetchRegistrations` בקומפוננטת `GameRegistration.tsx`
- במקום להשתמש ב-JOIN שנכשל, נבצע:
  1. שאילתה רגילה ל-`registrations` בלי ה-JOIN
  2. שאילתה נפרדת לפרופילים לפי ה-`user_id` שחזרו
  3. מיזוג הנתונים בקוד

**חלק 2: מניעת הרשמה כפולה**
- לפני הרשמה, לבדוק אם המשתמש כבר רשום לאותו משחק
- להציג הודעת שגיאה ברורה אם הוא כבר רשום

**חלק 3: הצגת מונה שחקנים**
- כבר קיים בקוד (`{activeRegistrations.length}/{MAX_ACTIVE_PLAYERS}`)
- יעבוד אוטומטית אחרי תיקון השאילתה

**חלק 4: כפתור צ'ק-אין עם הגבלת זמן**
- לחשב אם הזמן הנוכחי הוא 20 דקות או פחות לפני תחילת המשחק
- להשבית את הכפתור אם עוד מוקדם מדי
- להציג טקסט שמסביר מתי הכפתור יהיה זמין

---

### פרטים טכניים

**שינויים ב-`src/components/game/GameRegistration.tsx`:**

```text
// fetchRegistrations - גרסה חדשה
1. שאילתה ל-registrations ללא JOIN:
   .from('registrations')
   .select('*')
   .eq('game_id', currentGame.id)
   .neq('status', 'cancelled')

2. חילוץ רשימת user_ids ייחודיים

3. שאילתה ל-profiles:
   .from('profiles')
   .select('id, full_name')
   .in('id', userIds)

4. מיפוי והוספת שם לכל הרשמה
```

**לוגיקה חדשה לזמינות צ'ק-אין:**
```text
const canCheckIn = () => {
  if (!currentGame?.kickoff_time) return false;
  const kickoff = new Date(currentGame.kickoff_time);
  const now = new Date();
  const minutesUntilKickoff = (kickoff.getTime() - now.getTime()) / (1000 * 60);
  return minutesUntilKickoff <= 20 && minutesUntilKickoff > -30;
};
```

**עדכון כפתור הצ'ק-אין:**
- כאשר `canCheckIn()` === false: הכפתור מושבת עם טקסט "צ'ק-אין ייפתח 20 דקות לפני המשחק"
- כאשר `canCheckIn()` === true: הכפתור פעיל לסריקה

**עדכון `handleRegister`:**
- בדיקה מקדימה אם `userRegistration` כבר קיים
- החזרת הודעת שגיאה במקום ניסיון הוספה כפול

**שינויים ב-`src/components/game/PlayerList.tsx`:**
- התאמת הטיפוס לקבל `full_name` ישירות על ההרשמה במקום `profiles.full_name`

