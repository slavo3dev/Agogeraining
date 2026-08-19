export interface ExerciseSeed {
  slug: string;
  name: string;
  movementPattern: "squat" | "hinge" | "push" | "pull" | "carry" | "core" | "locomotion" | "mobility";
  category: "strength" | "cardio" | "mobility";
  equipment: "none" | "dumbbell" | "barbell" | "kettlebell" | "band" | "pullup_bar" | "machine";
  instructions: string;
  alternatives: string[];
}

export const EXERCISES: ExerciseSeed[] = [
  { slug: "bodyweight-squat", name: "Bodyweight Squat", movementPattern: "squat", category: "strength", equipment: "none", instructions: "Feet shoulder-width, sit hips back and down under control, drive up through mid-foot.", alternatives: ["box-squat", "goblet-squat"] },
  { slug: "box-squat", name: "Box Squat", movementPattern: "squat", category: "strength", equipment: "none", instructions: "Sit back to a chair or box, pause lightly, stand. Good option when returning to exercise.", alternatives: ["bodyweight-squat"] },
  { slug: "goblet-squat", name: "Goblet Squat", movementPattern: "squat", category: "strength", equipment: "dumbbell", instructions: "Hold a weight at the chest, squat to a comfortable depth.", alternatives: ["bodyweight-squat"] },
  { slug: "push-up", name: "Push-up", movementPattern: "push", category: "strength", equipment: "none", instructions: "Body in a straight line, lower chest toward the floor, press away.", alternatives: ["incline-push-up", "knee-push-up"] },
  { slug: "incline-push-up", name: "Incline Push-up", movementPattern: "push", category: "strength", equipment: "none", instructions: "Hands on a bench or counter; easier than the floor version.", alternatives: ["push-up"] },
  { slug: "knee-push-up", name: "Knee Push-up", movementPattern: "push", category: "strength", equipment: "none", instructions: "Same line from knees to head; lower under control.", alternatives: ["incline-push-up"] },
  { slug: "dumbbell-row", name: "One-arm Dumbbell Row", movementPattern: "pull", category: "strength", equipment: "dumbbell", instructions: "Hinge, flat back, pull the weight toward the hip.", alternatives: ["band-row", "inverted-row"] },
  { slug: "band-row", name: "Band Row", movementPattern: "pull", category: "strength", equipment: "band", instructions: "Anchor a band, pull elbows back, squeeze shoulder blades.", alternatives: ["dumbbell-row"] },
  { slug: "inverted-row", name: "Inverted Row", movementPattern: "pull", category: "strength", equipment: "none", instructions: "Under a sturdy table or low bar, pull chest toward it.", alternatives: ["band-row"] },
  { slug: "romanian-deadlift", name: "Romanian Deadlift", movementPattern: "hinge", category: "strength", equipment: "dumbbell", instructions: "Soft knees, hips back, lower to mid-shin, stand tall.", alternatives: ["hip-hinge-drill"] },
  { slug: "hip-hinge-drill", name: "Hip Hinge Drill", movementPattern: "hinge", category: "strength", equipment: "none", instructions: "Hands on hips, push hips back keeping spine neutral.", alternatives: [] },
  { slug: "plank", name: "Plank", movementPattern: "core", category: "strength", equipment: "none", instructions: "Forearms down, ribs tucked, hold a straight line.", alternatives: ["dead-bug"] },
  { slug: "dead-bug", name: "Dead Bug", movementPattern: "core", category: "strength", equipment: "none", instructions: "On your back, alternate extending opposite arm and leg, low back stays down.", alternatives: ["plank"] },
  { slug: "farmer-carry", name: "Farmer Carry", movementPattern: "carry", category: "strength", equipment: "dumbbell", instructions: "Carry a weight in each hand, tall posture, walk steadily.", alternatives: ["suitcase-carry"] },
  { slug: "suitcase-carry", name: "Suitcase Carry", movementPattern: "carry", category: "strength", equipment: "dumbbell", instructions: "Single weight at one side, stay upright.", alternatives: ["farmer-carry"] },
  { slug: "zone2-walk", name: "Zone 2 Walk", movementPattern: "locomotion", category: "cardio", equipment: "none", instructions: "Brisk walk where you can still hold a conversation.", alternatives: ["zone2-jog", "zone2-bike"] },
  { slug: "zone2-jog", name: "Zone 2 Jog", movementPattern: "locomotion", category: "cardio", equipment: "none", instructions: "Easy jog at conversational pace.", alternatives: ["zone2-walk"] },
  { slug: "zone2-bike", name: "Zone 2 Bike", movementPattern: "locomotion", category: "cardio", equipment: "none", instructions: "Steady easy ride, conversational effort.", alternatives: ["zone2-walk"] },
  { slug: "cat-cow", name: "Cat-Cow", movementPattern: "mobility", category: "mobility", equipment: "none", instructions: "On hands and knees, slowly round and arch the spine with the breath.", alternatives: [] },
  { slug: "worlds-greatest-stretch", name: "World's Greatest Stretch", movementPattern: "mobility", category: "mobility", equipment: "none", instructions: "Deep lunge, rotate chest toward the front knee, reach up.", alternatives: ["cat-cow"] },
  { slug: "hip-flexor-stretch", name: "Half-kneeling Hip Flexor Stretch", movementPattern: "mobility", category: "mobility", equipment: "none", instructions: "Half-kneeling, tuck pelvis, shift forward gently.", alternatives: [] },
];
