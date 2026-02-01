
## תיקון תצוגת הזמן עד הצ'ק-אין

### הבעיה
כאשר הזמן עד המשחק גדול מ-24 שעות, המערכת מציגה רק שעות (למשל "146 שעות ו-43 דקות") במקום להציג ימים, שעות ודקות בצורה קריאה יותר.

### הפתרון
לעדכן את הפונקציה `canCheckIn` כך שתזהה מתי יש יותר מ-24 שעות ותציג את הזמן בפורמט "X ימים, Y שעות ו-Z דקות".

### שינויים

**קובץ: `src/components/game/GameRegistration.tsx`**

עדכון הלוגיקה בפונקציה `canCheckIn` (שורות 149-156):

**לפני:**
```typescript
if (minutesUntilKickoff > 20) {
  const hours = Math.floor(minutesUntilKickoff / 60);
  const mins = Math.round(minutesUntilKickoff % 60);
  const timeStr = hours > 0 ? `${hours} שעות ו-${mins} דקות` : `${mins} דקות`;
  return { 
    allowed: false, 
    message: `צ'ק-אין ייפתח עוד ${timeStr}` 
  };
}
```

**אחרי:**
```typescript
if (minutesUntilKickoff > 20) {
  const totalMinutes = minutesUntilKickoff;
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = Math.round(totalMinutes % 60);
  
  let timeStr = '';
  if (days > 0) {
    timeStr = `${days} ${days === 1 ? 'יום' : 'ימים'}`;
    if (hours > 0) timeStr += `, ${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
    if (mins > 0) timeStr += ` ו-${mins} דקות`;
  } else if (hours > 0) {
    timeStr = `${hours} ${hours === 1 ? 'שעה' : 'שעות'} ו-${mins} דקות`;
  } else {
    timeStr = `${mins} דקות`;
  }
  
  return { 
    allowed: false, 
    message: `צ'ק-אין ייפתח בעוד ${timeStr}` 
  };
}
```

### דוגמאות לתצוגה החדשה
- 146 שעות → **6 ימים, 2 שעות ו-43 דקות**
- 25 שעות → **יום, שעה ו-0 דקות**
- 3 שעות → **3 שעות ו-0 דקות**
- 15 דקות → **15 דקות**
