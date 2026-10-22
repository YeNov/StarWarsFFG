/**
 * The talent entries of the roll option library (roll-option-library.js), beyond the first eight:
 * talents from the core and reSpecialized specialization trees whose effect fits the roll dialog.
 * Each is { id, names, options }; the library turns them into entries of kind "talent".
 *
 * The first name is the display name and the macro's name. Names match through normalizeName, so
 * case, spacing and punctuation (the asterisk on some names included) do not matter. Labels and
 * hints are English, like the book names: once installed they are the GM's macro text to edit.
 *
 * Reviewed talent by talent by the user (2026-10-22): fixed results are added to the pool, Boost
 * trades take Boost dice, swaps change the characteristic or skill, Force dice and the Destiny
 * pool are read live, and a talent that sets up a later check or is an action of its own was
 * left out (docs/roll-options-deferred.md lists the special actions).
 */

// Derived from each talent's rule text; where an option covers only part of a talent, its hint says what is left to the table.
export const TALENT_ENTRIES = [
  {
    id: "against-the-odds",
    names: ["Against The Odds*"],
    options: [
      {
        id: "against-the-odds",
        label: "Against The Odds*",
        offer: { minDifficulty: 4 },
        dice: { boost: "ranks" },
      },
    ],
  },
  {
    id: "ambush",
    names: ["Ambush"],
    options: [
      {
        id: "ambush",
        label: "Ambush",
        hint: "Once per round, in cover, target within short: +Stealth ranks damage to one hit",
        offer: { skillTypes: ["Combat"], attack: true },
        cost: { maneuvers: 1 },
      },
    ],
  },
  {
    id: "ambusher",
    names: ["Ambusher"],
    options: [
      {
        id: "ambusher",
        label: "Ambusher",
        hint: "Once per round, covered or concealed; within medium, not vehicles: +Stealth ranks damage",
        offer: { skillTypes: ["Combat"], attack: true },
        cost: { maneuvers: 1 },
      },
    ],
  },
  {
    id: "animal-companion",
    names: ["Animal Companion"],
    options: [
      {
        id: "animal-companion",
        label: "Animal Companion",
        hint: "Soothing or healing your Animal Companion",
        offer: { skills: ["Survival", "Medicine"] },
        dice: { upgradeAbility: 1 },
      },
    ],
  },
  {
    id: "animal-empathy",
    names: ["Animal Empathy"],
    options: [
      {
        id: "animal-empathy",
        label: "Animal Empathy",
        hint: "Animal handling; Force point: Success or Advantage",
        offer: { skills: ["Survival"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "anything-can-kill-improved",
    names: ["Anything Can Kill (Improved)"],
    options: [
      {
        id: "anything-can-kill-improved",
        label: "Anything Can Kill (Improved)",
        hint: "Improvised weapon: destroy it to add a Proficiency die by hand",
        offer: { skillTypes: ["Combat"], attack: true },
      },
    ],
  },
  {
    id: "assassinate-improved",
    names: ["Assassinate (Improved)"],
    options: [
      {
        id: "assassinate-improved",
        label: "Assassinate (Improved)",
        hint: "Undetected by the target",
        offer: { skillTypes: ["Combat"], attack: true },
        amount: { label: "Boost traded" },
        cost: { strain: "amount" },
        dice: { advantage: "amount", removeBoost: "amount" },
      },
    ],
  },
  {
    id: "bad-influence",
    names: ["Bad Influence"],
    options: [
      {
        id: "bad-influence",
        label: "Bad Influence",
        hint: "Against a foe whose 3 Threat or Despair you spent this encounter",
        offer: { skillTypes: ["Social"] },
        dice: { upgradeAbility: 1 },
      },
    ],
  },
  {
    id: "bargain-hunter",
    names: ["Bargain Hunter"],
    options: [
      {
        id: "bargain-hunter",
        label: "Bargain Hunter",
        hint: "Buying or selling goods or services",
        offer: { skills: ["Negotiation", "Streetwise"] },
        choices: [
          { id: "boost", label: "Boost", dice: { boost: "ranks" } },
          { id: "setback", label: "Remove Setback", dice: { removeSetback: "ranks" } },
        ],
      },
    ],
  },
  {
    id: "barrage",
    names: ["Barrage"],
    options: [
      {
        id: "barrage",
        label: "Barrage",
        hint: "Long or extreme range: +1 damage per rank to one hit",
        offer: { skills: ["Ranged: Heavy", "Gunnery"] },
      },
    ],
  },
  {
    id: "beast-wrangler",
    names: ["Beast Wrangler"],
    options: [
      {
        id: "beast-wrangler",
        label: "Beast Wrangler",
        hint: "Taming or wrangling creatures",
        offer: { skills: ["Survival"] },
        dice: { boost: "ranks" },
      },
    ],
  },
  {
    id: "bedside-manners",
    names: ["Bedside Manners"],
    options: [
      {
        id: "bedside-manners",
        label: "Bedside Manners",
        hint: "How you treated the target this encounter",
        offer: { skillTypes: ["Social"] },
        choices: [
          { id: "treated", label: "Treated", dice: { advantage: 2 } },
          { id: "tortured", label: "Tortured", dice: { success: 1, threat: 2 } },
        ],
      },
    ],
  },
  {
    id: "beginners-luck",
    names: ["Beginner's Luck"],
    options: [
      {
        id: "beginners-luck",
        label: "Beginner's Luck",
        hint: "Once per session",
        dice: { success: "destinyLight" },
      },
    ],
  },
  {
    id: "blending-in",
    names: ["Blending In"],
    options: [
      {
        id: "blending-in",
        label: "Blending In",
        offer: { skills: ["Stealth"] },
        cost: { strain: 2 },
        characteristic: "Cunning",
      },
    ],
  },
  {
    id: "blind-spot",
    names: ["Blind Spot"],
    options: [
      {
        id: "blind-spot",
        label: "Blind Spot",
        hint: "Benefiting from cover",
        offer: { skillTypes: ["Combat"] },
        dice: { advantage: 1 },
      },
    ],
  },
  {
    id: "blooded",
    names: ["Blooded"],
    options: [
      {
        id: "blooded",
        label: "Blooded",
        hint: "Resisting or recovering from poisons, venoms or toxins",
        offer: { skills: ["Resilience"] },
        dice: { boost: "ranks" },
      },
    ],
  },
  {
    id: "bloodlust",
    names: ["Bloodlust"],
    options: [
      {
        id: "bloodlust",
        label: "Bloodlust",
        hint: "Next check after incapacitating or critting a foe this encounter",
        dice: { boost: "ranks" },
      },
    ],
  },
  {
    id: "bolster",
    names: ["Bolster"],
    options: [
      {
        id: "bolster",
        label: "Bolster",
        hint: "Environmental setback, after the Bolster maneuver this encounter",
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "brace",
    names: ["Brace"],
    options: [
      {
        id: "brace",
        label: "Brace",
        hint: "Environmental setback only",
        cost: { maneuvers: 1 },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "by-the-book",
    names: ["By the Book"],
    options: [
      {
        id: "by-the-book",
        label: "By the Book",
        hint: "Once per encounter",
        offer: { skillTypes: ["Combat"] },
        cost: { strain: 2 },
        dice: { advantage: "ranks" },
      },
    ],
  },
  {
    id: "bypass-security",
    names: ["Bypass Security"],
    options: [
      {
        id: "bypass-security",
        label: "Bypass Security",
        hint: "Disabling a security device or opening a locked door",
        offer: { skills: ["Computers", "Skulduggery"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "bypass-security-improved",
    names: ["Bypass Security (Improved)*"],
    options: [
      {
        id: "bypass-security-improved",
        label: "Bypass Security (Improved)*",
        hint: "Same system or location this session, after spending 3 Advantage or a Triumph",
        offer: { skills: ["Computers", "Skulduggery"] },
        amount: { label: "Your Bypass Security ranks" },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "cannibalize",
    names: ["Cannibalize*"],
    options: [
      {
        id: "cannibalize",
        label: "Cannibalize*",
        hint: "Once per encounter: scrap similar gear",
        offer: { skills: ["Mechanics"] },
        dice: { success: 1 },
      },
    ],
  },
  {
    id: "center-of-attention",
    names: ["Center of Attention*"],
    options: [
      {
        id: "center-of-attention",
        label: "Center of Attention*",
        hint: "Before an audience: a Triumph on success, a Despair on failure",
        offer: { skillTypes: ["Social"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "clanker-killer",
    names: ["Clanker Killer"],
    options: [
      {
        id: "clanker-killer",
        label: "Clanker Killer",
        hint: "Targeting a droid",
        offer: { skillTypes: ["Combat"] },
        amount: { max: "ranks", label: "Boost traded" },
        dice: { removeBoost: "amount" },
        choices: [
          { id: "success", label: "Success", dice: { success: "amount" } },
          { id: "advantage", label: "Advantage", dice: { advantage: "amount" } },
        ],
      },
    ],
  },
  {
    id: "clanker-killer-improved",
    names: ["Clanker Killer (Improved)"],
    options: [
      {
        id: "clanker-killer-improved",
        label: "Clanker Killer (Improved)",
        hint: "Targeting a droid: critical rating −1 per Clanker Killer rank",
        offer: { skills: ["Brawl", "Melee"] },
      },
    ],
  },
  {
    id: "codebreaker",
    names: ["Codebreaker"],
    options: [
      {
        id: "codebreaker",
        label: "Codebreaker",
        hint: "Breaking codes or decrypting communications",
        offer: { skills: ["Computers"] },
        dice: { removeSetback: "ranks", difficulty: -1 },
      },
    ],
  },
  {
    id: "compelling-counterpart",
    names: ["Compelling Counterpart*"],
    options: [
      {
        id: "compelling-counterpart",
        label: "Compelling Counterpart*",
        hint: "Your chosen skill, engaged with your Droid Companion",
        offer: { skillTypes: ["Social"] },
        dice: { advantage: 1 },
      },
    ],
  },
  {
    id: "confidence",
    names: ["Confidence"],
    options: [
      {
        id: "confidence",
        label: "Confidence",
        hint: "Discipline check to avoid fear; at 0, no check",
        offer: { skills: ["Discipline"] },
        dice: { difficulty: "-ranks" },
      },
    ],
  },
  {
    id: "congenial",
    names: ["Congenial"],
    options: [
      {
        id: "congenial",
        label: "Congenial",
        offer: { skills: ["Charm", "Negotiation"] },
        amount: { max: "ranks", label: "Strain" },
        cost: { strain: "amount" },
        dice: { downgradeDifficulty: "amount" },
      },
    ],
  },
  {
    id: "construction-specialist",
    names: ["Construction Specialist"],
    options: [
      {
        id: "construction-specialist",
        label: "Construction Specialist",
        hint: "Constructing defenses, positions or fortifications",
        offer: { skills: ["Mechanics"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "constructor",
    names: ["Constructor"],
    options: [
      {
        id: "constructor",
        label: "Constructor",
        hint: "Constructing bases, defenses or positions",
        offer: { skills: ["Mechanics"] },
        choices: [
          { id: "boost", label: "Boost", dice: { boost: "ranks" } },
          { id: "setback", label: "Remove Setback", dice: { removeSetback: "ranks" } },
        ],
      },
    ],
  },
  {
    id: "counterstrike",
    names: ["Counterstrike"],
    options: [
      {
        id: "counterstrike",
        label: "Counterstrike",
        hint: "Against an attacker who missed you with a Despair or 2 Threat this encounter",
        offer: { skills: ["Lightsaber"] },
        dice: { upgradeAbility: 1 },
      },
    ],
  },
  {
    id: "crippling-blow",
    names: ["Crippling Blow"],
    options: [
      {
        id: "crippling-blow",
        label: "Crippling Blow",
        hint: "If it deals damage: target suffers 1 strain whenever it moves this encounter",
        offer: { skillTypes: ["Combat"] },
        dice: { difficulty: 1 },
      },
    ],
  },
  {
    id: "cunning-persona",
    names: ["Cunning Persona"],
    options: [
      {
        id: "cunning-persona",
        label: "Cunning Persona",
        offer: { skills: ["Charm"] },
        cost: { strain: 2 },
        characteristic: "Cunning",
      },
    ],
  },
  {
    id: "cyberneticist",
    names: ["Cyberneticist"],
    options: [
      {
        id: "cyberneticist",
        label: "Cyberneticist",
        hint: "Building, repairing or installing cybernetics",
        offer: { skills: ["Mechanics", "Medicine"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "danger-close-improved",
    names: ["Danger Close (Improved)"],
    options: [
      {
        id: "danger-close-improved",
        label: "Danger Close (Improved)",
        hint: "Next check after engaging a foe",
        dice: { success: 1 },
      },
    ],
  },
  {
    id: "dangerous-development",
    names: ["Dangerous Development*"],
    options: [
      {
        id: "dangerous-development",
        label: "Dangerous Development*",
        hint: "Improving or crafting an item; on success, add one permanent improvement",
        offer: { skills: ["Mechanics"] },
        cost: { strain: 2 },
        dice: { upgradeDifficulty: 1 },
      },
    ],
  },
  {
    id: "dead-eye",
    names: ["Dead-Eye"],
    options: [
      {
        id: "dead-eye",
        label: "Dead-Eye",
        hint: "Third aim maneuver",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
        cost: { maneuvers: 1 },
        choices: [
          { id: "boost", label: "Boost", dice: { boost: 1 } },
          { id: "called-shot", label: "Called shot", dice: { removeSetback: 1 } },
        ],
      },
    ],
  },
  {
    id: "death-before-discovery",
    names: ["Death Before Discovery"],
    options: [
      {
        id: "death-before-discovery",
        label: "Death Before Discovery",
        hint: "Once per session, spend a Destiny Point: against someone uncovering your identity or mission",
        offer: { skillTypes: ["Combat"] },
        dice: { triumph: 1 },
      },
    ],
  },
  {
    id: "deft-maker",
    names: ["Deft Maker"],
    options: [
      {
        id: "deft-maker",
        label: "Deft Maker",
        hint: "Repairing, modifying, building or programming droids",
        offer: { skills: ["Mechanics", "Computers"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "design-flaw",
    names: ["Design Flaw"],
    options: [
      {
        id: "design-flaw",
        label: "Design Flaw",
        hint: "Personal-scale weapon against a droid",
        offer: { skillTypes: ["Combat"], attack: true },
        dice: { advantage: "ranks" },
      },
    ],
  },
  {
    id: "dialed-in-improved",
    names: ["Dialed In (Improved)"],
    options: [
      {
        id: "dialed-in-improved",
        label: "Dialed In (Improved)",
        hint: "Long or extreme range, after spending 2 Advantage or a Triumph on Dialed In",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "disciple-of-lore",
    names: ["Disciple of Lore"],
    options: [
      {
        id: "disciple-of-lore",
        label: "Disciple of Lore",
        hint: "Once per round",
        offer: { skills: ["Knowledge: Lore"] },
        cost: { strain: 1 },
        dice: { difficulty: "-ranks" },
      },
    ],
  },
  {
    id: "disruptive",
    names: ["Disruptive"],
    options: [
      {
        id: "disruptive",
        label: "Disruptive",
        offer: { skills: ["Computers"] },
        amount: { max: "ranks", label: "Strain" },
        cost: { strain: "amount" },
        dice: { downgradeDifficulty: "amount" },
      },
    ],
  },
  {
    id: "doctors-orders",
    names: ["Doctor's Orders*"],
    options: [
      {
        id: "doctors-orders",
        label: "Doctor's Orders*",
        hint: "Healing a Critical Injury of a patient under your supervision",
        offer: { skills: ["Medicine"] },
        dice: { success: 1 },
      },
    ],
  },
  {
    id: "double-or-nothing",
    names: ["Double or Nothing"],
    options: [
      {
        id: "double-or-nothing",
        label: "Double or Nothing",
        hint: "After cancelling, double the remaining Advantage",
        cost: { strain: 2 },
        dice: { difficulty: 1 },
      },
    ],
  },
  {
    id: "duelists-training",
    names: ["Duelist's Training"],
    options: [
      {
        id: "duelists-training",
        label: "Duelist's Training",
        hint: "Engaged with only one opponent",
        offer: { skills: ["Melee", "Lightsaber"] },
        dice: { boost: 1 },
      },
    ],
  },
  {
    id: "dynamic-fire",
    names: ["Dynamic Fire"],
    options: [
      {
        id: "dynamic-fire",
        label: "Dynamic Fire",
        hint: "Ranged attack while engaged: range modifier −1",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "embrace-your-hate",
    names: ["Embrace Your Hate"],
    options: [
      {
        id: "embrace-your-hate",
        label: "Embrace Your Hate",
        hint: "Once per encounter per rank: Destiny Point; Conflict and damage = dark side points",
        offer: { skills: ["Melee", "Lightsaber", "Brawl"] },
      },
    ],
  },
  {
    id: "enhanced-leader",
    names: ["Enhanced Leader"],
    options: [
      {
        id: "enhanced-leader",
        label: "Enhanced Leader",
        hint: "Force point: Success or Advantage",
        offer: { skills: ["Leadership"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "enough-to-get-by",
    names: ["Enough to Get By"],
    options: [
      {
        id: "enough-to-get-by",
        label: "Enough to Get By",
        hint: "Once per encounter: Boost dice = Knowledge (Education) ranks",
        amount: { label: "Your Knowledge (Education) ranks" },
        cost: { strain: 2 },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "essential-kill",
    names: ["Essential Kill"],
    options: [
      {
        id: "essential-kill",
        label: "Essential Kill",
        hint: "Force point: Advantage; 3 Force points: Triumph",
        offer: { skills: ["Brawl", "Lightsaber", "Melee", "Ranged: Light", "Ranged: Heavy"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "evac-training",
    names: ["Evac Training"],
    options: [
      {
        id: "evac-training",
        label: "Evac Training",
        hint: "Checks imposed by carrying characters",
        offer: { skills: ["Athletics", "Coordination"] },
        dice: { boost: 2 },
      },
    ],
  },
  {
    id: "exceed-specifications",
    names: ["Exceed Specifications"],
    options: [
      {
        id: "exceed-specifications",
        label: "Exceed Specifications",
        hint: "Check using an item; GM may spend 2 Threat or a Despair to damage it",
        dice: { boost: 1 },
      },
    ],
  },
  {
    id: "exceed-specifications-improved",
    names: ["Exceed Specifications (Improved)"],
    options: [
      {
        id: "exceed-specifications-improved",
        label: "Exceed Specifications (Improved)",
        hint: "Instead of the Boost die; GM may spend 2 Threat or a Despair to damage the item",
        dice: { upgradeAbility: 1 },
      },
    ],
  },
  {
    id: "exhaust-port",
    names: ["Exhaust Port"],
    options: [
      {
        id: "exhaust-port",
        label: "Exhaust Port",
        hint: "Attacking a starship or vehicle: spend a Destiny Point to ignore Massive",
        offer: { skillTypes: ["Combat"], attack: true },
      },
    ],
  },
  {
    id: "expert-handler",
    names: ["Expert Handler"],
    options: [
      {
        id: "expert-handler",
        label: "Expert Handler",
        hint: "Riding beasts",
        offer: { skills: ["Survival"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "expert-tracker",
    names: ["Expert Tracker"],
    options: [
      {
        id: "expert-tracker",
        label: "Expert Tracker",
        hint: "Finding tracks or tracking targets",
        offer: { skills: ["Survival"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "exploit-weakness",
    names: ["Exploit Weakness"],
    options: [
      {
        id: "exploit-weakness",
        label: "Exploit Weakness",
        hint: "Target disoriented, immobilized, knocked prone, poisoned, staggered or incapacitated",
        offer: { skillTypes: ["Combat"] },
        dice: { boost: 2 },
      },
    ],
  },
  {
    id: "extended-reach",
    names: ["Extended Reach"],
    options: [
      {
        id: "extended-reach",
        label: "Extended Reach",
        hint: "Two-handed melee weapon: target up to short range",
        offer: { skills: ["Melee"] },
        cost: { strain: 1 },
      },
    ],
  },
  {
    id: "eye-of-the-storm",
    names: ["Eye of the Storm"],
    options: [
      {
        id: "eye-of-the-storm",
        label: "Eye of the Storm",
        hint: "Blast = Brawn + Discipline ranks; affects foes only",
        offer: { skills: ["Brawl"] },
        cost: { strain: 1, maneuvers: 1 },
      },
    ],
  },
  {
    id: "falling-avalanche",
    names: ["Falling Avalanche"],
    options: [
      {
        id: "falling-avalanche",
        label: "Falling Avalanche",
        hint: "+ Brawn damage",
        offer: { skills: ["Lightsaber"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "fancy-paint-job",
    names: ["Fancy Paint Job"],
    options: [
      {
        id: "fancy-paint-job",
        label: "Fancy Paint Job",
        hint: "In the presence of your Signature Vehicle",
        offer: { skills: ["Charm", "Deception", "Negotiation"] },
        dice: { upgradeAbility: 1 },
      },
    ],
  },
  {
    id: "field-calibration-imp",
    names: ["Field Calibration (Imp)*"],
    options: [
      {
        id: "field-calibration-imp",
        label: "Field Calibration (Imp)*",
        hint: "Once per round: Field Calibration as a maneuver",
        offer: { skills: ["Mechanics"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "field-tester",
    names: ["Field Tester*"],
    options: [
      {
        id: "field-tester",
        label: "Field Tester*",
        hint: "Using equipment or a vessel you repaired or improved this session",
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "finish-the-fight",
    names: ["Finish the Fight"],
    options: [
      {
        id: "finish-the-fight",
        label: "Finish the Fight",
        hint: "Activated when hit (2 strain then): +Resilience ranks damage to one hit",
        offer: { skillTypes: ["Combat"], attack: true },
      },
    ],
  },
  {
    id: "finish-the-fight-improved",
    names: ["Finish the Fight (Improved)"],
    options: [
      {
        id: "finish-the-fight-improved",
        label: "Finish the Fight (Improved)",
        hint: "After Finish the Fight: Critical Injuries +10 × Resilience ranks",
        offer: { skillTypes: ["Combat"], attack: true },
      },
    ],
  },
  {
    id: "forager",
    names: ["Forager"],
    options: [
      {
        id: "forager",
        label: "Forager",
        hint: "Finding food, water or shelter",
        offer: { skills: ["Survival"] },
        dice: { removeSetback: 2 },
      },
    ],
  },
  {
    id: "force-connection",
    names: ["Force Connection"],
    options: [
      {
        id: "force-connection",
        label: "Force Connection",
        hint: "Force point: Success or Advantage",
        offer: { skills: ["Survival", "Knowledge: Xenology"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "friends-in-low-places",
    names: ["Friends in Low Places"],
    options: [
      {
        id: "friends-in-low-places",
        label: "Friends in Low Places",
        hint: "Finding or interacting with the criminal element",
        offer: { skills: ["Streetwise", "Charm", "Coercion", "Deception", "Negotiation", "Knowledge: Underworld"] },
        dice: { advantage: "ranks" },
      },
    ],
  },
  {
    id: "friends-in-low-places-improved",
    names: ["Friends in Low Places (Improved)"],
    options: [
      {
        id: "friends-in-low-places-improved",
        label: "Friends in Low Places (Improved)",
        hint: "Once per encounter, interacting with the criminal element; minimum Easy",
        offer: { skills: ["Streetwise", "Charm", "Coercion", "Deception", "Negotiation", "Knowledge: Underworld"] },
        amount: { label: "Strain (up to your Friends in Low Places ranks)" },
        cost: { strain: "amount" },
        dice: { difficulty: "-amount" },
        difficultyFloor: 1,
      },
    ],
  },
  {
    id: "full-throttle-improved",
    names: ["Full Throttle (Improved)"],
    options: [
      {
        id: "full-throttle-improved",
        label: "Full Throttle (Improved)",
        hint: "Full Throttle as a maneuver; Hard becomes Average",
        offer: { skills: ["Piloting: Planetary", "Piloting: Space"] },
        cost: { strain: 1 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "gatherer",
    names: ["Gatherer"],
    options: [
      {
        id: "gatherer",
        label: "Gatherer",
        hint: "Foraging for food, water or shelter",
        offer: { skills: ["Survival"] },
        choices: [
          { id: "boost", label: "Boost", dice: { boost: "ranks" } },
          { id: "setback", label: "Remove Setback", dice: { removeSetback: "ranks" } },
        ],
      },
    ],
  },
  {
    id: "get-the-drop",
    names: ["Get The Drop"],
    options: [
      {
        id: "get-the-drop",
        label: "Get The Drop",
        hint: "Once per session, initiative; allies add it too",
        offer: { skills: ["Cool", "Vigilance"] },
        amount: { label: "Your Stealth ranks" },
        dice: { success: "amount" },
      },
    ],
  },
  {
    id: "gliding-step",
    names: ["Gliding Step"],
    options: [
      {
        id: "gliding-step",
        label: "Gliding Step",
        hint: "1 Boost die per Move maneuver this round",
        offer: { skills: ["Melee", "Lightsaber", "Brawl"] },
        amount: { max: 2, label: "Move maneuvers" },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "greased-palms",
    names: ["Greased Palms"],
    options: [
      {
        id: "greased-palms",
        label: "Greased Palms",
        hint: "50 credits per upgrade",
        offer: { skillTypes: ["Social"] },
        amount: { max: "ranks", label: "× 50 credits" },
        dice: { upgradeAbility: "amount" },
      },
    ],
  },
  {
    id: "happy-to-help-imp",
    names: ["Happy to Help (Imp)*"],
    options: [
      {
        id: "happy-to-help-imp",
        label: "Happy to Help (Imp)*",
        hint: "Once per encounter, assisting or assisted: instead of Happy to Help's Boost die",
        dice: { success: 1 },
      },
    ],
  },
  {
    id: "happy-to-help",
    names: ["Happy to Help*"],
    options: [
      {
        id: "happy-to-help",
        label: "Happy to Help*",
        hint: "Providing or accepting assistance",
        dice: { boost: 1 },
      },
    ],
  },
  {
    id: "hindering-shot",
    names: ["Hindering Shot"],
    options: [
      {
        id: "hindering-shot",
        label: "Hindering Shot",
        hint: "On damage: system strain = speed whenever the target moves this encounter",
        offer: { skills: ["Gunnery"] },
        dice: { difficulty: 1 },
      },
    ],
  },
  {
    id: "historian",
    names: ["Historian"],
    options: [
      {
        id: "historian",
        label: "Historian",
        hint: "Ancient or abandoned places or things",
        choices: [
          { id: "boost", label: "Boost", dice: { boost: "ranks" } },
          { id: "setback", label: "Remove Setback", dice: { removeSetback: "ranks" } },
        ],
      },
    ],
  },
  {
    id: "hot-swap",
    names: ["Hot Swap"],
    options: [
      {
        id: "hot-swap",
        label: "Hot Swap",
        hint: "After changing weapons: a weapon not yet used this encounter",
        offer: { skillTypes: ["Combat"], attack: true },
        dice: { boost: "ranks" },
      },
    ],
  },
  {
    id: "hunter",
    names: ["Hunter"],
    options: [
      {
        id: "hunter",
        label: "Hunter",
        hint: "Interacting with beasts or animals; +10 per rank to Critical Injuries on them",
        dice: { boost: "ranks" },
      },
    ],
  },
  {
    id: "hunter-supreme",
    names: ["Hunter (Supreme)"],
    options: [
      {
        id: "hunter-supreme",
        label: "Hunter (Supreme)",
        hint: "Non-sentient creature: critical rating −1 per strain (up to its silhouette), minimum 1",
        offer: { skillTypes: ["Combat"], attack: true },
        amount: { label: "Strain" },
        cost: { strain: "amount", maneuvers: 1 },
      },
    ],
  },
  {
    id: "imposing-leader",
    names: ["Imposing Leader"],
    options: [
      {
        id: "imposing-leader",
        label: "Imposing Leader",
        offer: { skills: ["Leadership"] },
        cost: { strain: 2 },
        characteristic: "Willpower",
      },
    ],
  },
  {
    id: "improvised-detonation-supreme",
    names: ["Improvised Detonation (Supreme)"],
    options: [
      {
        id: "improvised-detonation-supreme",
        label: "Improvised Detonation (Supreme)",
        hint: "Improvised Detonation: one quality per upgrade",
        offer: { skills: ["Mechanics"] },
        amount: { label: "Qualities added" },
        dice: { upgradeDifficulty: "amount" },
      },
    ],
  },
  {
    id: "in-the-know",
    names: ["In The Know"],
    options: [
      {
        id: "in-the-know",
        label: "In The Know",
        hint: "Getting information from people or disseminating news",
        offer: { skills: ["Charm", "Coercion", "Deception", "Negotiation", "Leadership", "Streetwise"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "inquiring",
    names: ["Inquiring"],
    options: [
      {
        id: "inquiring",
        label: "Inquiring",
        hint: "Investigating a case",
        choices: [
          { id: "boost", label: "Boost", dice: { boost: "ranks" } },
          { id: "setback", label: "Remove Setback", dice: { removeSetback: "ranks" } },
        ],
      },
    ],
  },
  {
    id: "inquiring-improved",
    names: ["Inquiring (Improved)"],
    options: [
      {
        id: "inquiring-improved",
        label: "Inquiring (Improved)",
        hint: "Investigating a crime; a mix of the two by hand",
        offer: { skillTypes: ["Social"] },
        amount: { label: "Boost traded (up to your Inquiring ranks)" },
        dice: { removeBoost: "amount" },
        choices: [
          { id: "success", label: "Success", dice: { success: "amount" } },
          { id: "advantage", label: "Advantage", dice: { advantage: "amount" } },
        ],
      },
    ],
  },
  {
    id: "inspiring-rhetoric-supreme",
    names: ["Inspiring Rhetoric (Supreme)"],
    options: [
      {
        id: "inspiring-rhetoric-supreme",
        label: "Inspiring Rhetoric (Supreme)",
        hint: "Inspiring Rhetoric as a maneuver",
        offer: { skills: ["Leadership"] },
        cost: { strain: 1 },
      },
    ],
  },
  {
    id: "intimidating",
    names: ["Intimidating"],
    options: [
      {
        id: "intimidating",
        label: "Intimidating",
        offer: { skills: ["Coercion"] },
        amount: { max: "ranks", label: "Strain" },
        cost: { strain: "amount" },
        dice: { downgradeDifficulty: "amount" },
      },
    ],
  },
  {
    id: "intuitive-improvements",
    names: ["Intuitive Improvements"],
    options: [
      {
        id: "intuitive-improvements",
        label: "Intuitive Improvements",
        hint: "Crafting or repairing; 2 Force points: +1 hard point (max 2)",
        offer: { skills: ["Mechanics"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "intuitive-navigation",
    names: ["Intuitive Navigation"],
    options: [
      {
        id: "intuitive-navigation",
        label: "Intuitive Navigation",
        hint: "Force point: Success or Advantage",
        offer: { skills: ["Astrogation", "Knowledge: Outer Rim"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "intuitive-shot",
    names: ["Intuitive Shot"],
    options: [
      {
        id: "intuitive-shot",
        label: "Intuitive Shot",
        hint: "Force point: Success or Advantage",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "intuitive-strike",
    names: ["Intuitive Strike"],
    options: [
      {
        id: "intuitive-strike",
        label: "Intuitive Strike",
        hint: "Planetary-scale weapon; 2 Force points: Success or Advantage",
        offer: { skillTypes: ["Combat"], attack: true },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "inventor",
    names: ["Inventor"],
    options: [
      {
        id: "inventor",
        label: "Inventor",
        hint: "Constructing items or modifying attachments",
        offer: { skills: ["Mechanics"] },
        choices: [
          { id: "boost", label: "Boost", dice: { boost: "ranks" } },
          { id: "setback", label: "Remove Setback", dice: { removeSetback: "ranks" } },
        ],
      },
    ],
  },
  {
    id: "jack-of-all-trades",
    names: ["Jack of All Trades"],
    options: [
      {
        id: "jack-of-all-trades",
        label: "Jack of All Trades",
        hint: "Skill ranks below Jack of All Trades ranks: up to the difference",
        amount: { max: "ranks", label: "Strain" },
        cost: { strain: "amount" },
        dice: { upgradeAbility: "amount" },
      },
    ],
  },
  {
    id: "kill-confirmed",
    names: ["Kill Confirmed"],
    options: [
      {
        id: "kill-confirmed",
        label: "Kill Confirmed",
        hint: "Once per session: one hit ignores soak; 2 Threat or a Despair: weapon malfunctions",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy", "Gunnery"] },
        dice: { upgradeDifficulty: 1 },
      },
    ],
  },
  {
    id: "knows-the-ropes",
    names: ["Knows the Ropes"],
    options: [
      {
        id: "knows-the-ropes",
        label: "Knows the Ropes",
        hint: "Escaping restraints: Boost dice = Knowledge (Underworld) ranks",
        offer: { skills: ["Athletics", "Coordination", "Skulduggery"] },
        amount: { label: "Your Knowledge (Underworld) ranks" },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "learning-opportunity",
    names: ["Learning Opportunity"],
    options: [
      {
        id: "learning-opportunity",
        label: "Learning Opportunity",
        hint: "Next check after spending 3 Advantage from a failed check",
        dice: { upgradeAbility: 1 },
      },
    ],
  },
  {
    id: "low-blow",
    names: ["Low Blow"],
    options: [
      {
        id: "low-blow",
        label: "Low Blow",
        hint: "Aimed attack: + (1 + ranks) strain, ignoring soak",
        offer: { skillTypes: ["Combat"], attack: true },
      },
    ],
  },
  {
    id: "low-blow-improved",
    names: ["Low Blow (Improved)"],
    options: [
      {
        id: "low-blow-improved",
        label: "Low Blow (Improved)",
        hint: "Once per encounter, spend a Destiny Point",
        offer: { skillTypes: ["Combat"] },
        amount: { label: "Boost traded" },
        dice: { advantage: "amount", removeBoost: "amount" },
      },
    ],
  },
  {
    id: "make-an-offer",
    names: ["Make An Offer..."],
    options: [
      {
        id: "make-an-offer",
        label: "Make An Offer...",
        hint: "Once per encounter, Destiny Point: Boost dice = Knowledge (Underworld) ranks",
        offer: { skillTypes: ["Social"] },
        amount: { label: "Your Knowledge (Underworld) ranks" },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "make-it-dangerous-improved",
    names: ["Make It Dangerous (Improved)"],
    options: [
      {
        id: "make-it-dangerous-improved",
        label: "Make It Dangerous (Improved)",
        hint: "Make It Dangerous check: Hard becomes Average",
        offer: { skills: ["Knowledge: Education"] },
        cost: { strain: 1 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "marked-for-death",
    names: ["Marked for Death"],
    options: [
      {
        id: "marked-for-death",
        label: "Marked for Death",
        hint: "Against your target, while Force stays committed to it",
        offer: { skillTypes: ["Combat"] },
        dice: { advantage: 2 },
      },
    ],
  },
  {
    id: "martial-grace",
    names: ["Martial Grace"],
    options: [
      {
        id: "martial-grace",
        label: "Martial Grace",
        hint: "Once per round: + Coordination ranks damage",
        offer: { skills: ["Brawl"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "martial-prowess",
    names: ["Martial Prowess"],
    options: [
      {
        id: "martial-prowess-athletics",
        label: "Martial Prowess: Athletics",
        offer: { skills: ["Melee"] },
        cost: { strain: 2 },
        skill: "Athletics",
      },
      {
        id: "martial-prowess-coordination",
        label: "Martial Prowess: Coordination",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
        cost: { strain: 2 },
        skill: "Coordination",
      },
    ],
  },
  {
    id: "master-artisan",
    names: ["Master Artisan"],
    options: [
      {
        id: "master-artisan",
        label: "Master Artisan",
        hint: "Once per round; minimum Easy",
        offer: { skills: ["Mechanics"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
        difficultyFloor: 1,
      },
    ],
  },
  {
    id: "master-cyberneticist",
    names: ["Master Cyberneticist"],
    options: [
      {
        id: "master-cyberneticist",
        label: "Master Cyberneticist",
        hint: "Once per round: healing a cyborg or working on cybernetics",
        offer: { skills: ["Medicine", "Mechanics"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "master-doctor",
    names: ["Master Doctor"],
    options: [
      {
        id: "master-doctor",
        label: "Master Doctor",
        hint: "Once per round",
        offer: { skills: ["Medicine"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "master-driver",
    names: ["Master Driver"],
    options: [
      {
        id: "master-driver",
        label: "Master Driver",
        hint: "Once per round, driving: this action as a maneuver",
        offer: { skills: ["Piloting: Planetary", "Gunnery"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "master-leader",
    names: ["Master Leader"],
    options: [
      {
        id: "master-leader",
        label: "Master Leader",
        hint: "Once per round; minimum Easy",
        offer: { skills: ["Leadership"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
        difficultyFloor: 1,
      },
    ],
  },
  {
    id: "master-manipulator",
    names: ["Master Manipulator"],
    options: [
      {
        id: "master-manipulator",
        label: "Master Manipulator",
        hint: "Once per round: this social check as a maneuver",
        offer: { skillTypes: ["Social"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "master-merchant",
    names: ["Master Merchant"],
    options: [
      {
        id: "master-merchant",
        label: "Master Merchant",
        hint: "Sell for 25% more or buy for 25% less; pay off 1 more Obligation or take 1 less",
        offer: { skills: ["Negotiation"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "master-missileer",
    names: ["Master Missileer"],
    options: [
      {
        id: "master-missileer",
        label: "Master Missileer",
        hint: "Guided roll; up to the weapon skill's ranks",
        offer: { skillTypes: ["Combat"], attack: true },
        amount: { label: "Strain" },
        cost: { strain: "amount" },
        dice: { upgradeAbility: "amount" },
      },
    ],
  },
  {
    id: "master-of-arms-supreme",
    names: ["Master of Arms (Supreme)"],
    options: [
      {
        id: "master-of-arms-supreme",
        label: "Master of Arms (Supreme)",
        hint: "Master of Arms: one upgrade per weapon beyond the first",
        offer: { skills: ["Mechanics"] },
        amount: { label: "Extra weapons" },
        dice: { upgradeDifficulty: "amount" },
      },
    ],
  },
  {
    id: "master-of-dealing",
    names: ["Master of Dealing"],
    options: [
      {
        id: "master-of-dealing",
        label: "Master of Dealing",
        hint: "Once per round: finding, buying or selling stolen, contraband or illegal goods",
        offer: { skills: ["Streetwise", "Negotiation"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "master-of-none",
    names: ["Master of None"],
    options: [
      {
        id: "master-of-none",
        label: "Master of None",
        hint: "Once per round, a skill with fewer than 2 ranks",
        dice: { success: 1 },
      },
    ],
  },
  {
    id: "master-of-shadows",
    names: ["Master of Shadows"],
    options: [
      {
        id: "master-of-shadows",
        label: "Master of Shadows",
        hint: "Once per round",
        offer: { skills: ["Stealth", "Skulduggery"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "master-pilot",
    names: ["Master Pilot"],
    options: [
      {
        id: "master-pilot",
        label: "Master Pilot",
        hint: "Once per round, piloting a starship: this action as a maneuver",
        offer: { skills: ["Piloting: Space", "Gunnery"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "master-rider",
    names: ["Master Rider"],
    options: [
      {
        id: "master-rider",
        label: "Master Rider",
        hint: "Once per turn, mounted: this check as a maneuver",
        offer: { skills: ["Survival"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "master-slicer",
    names: ["Master Slicer"],
    options: [
      {
        id: "master-slicer",
        label: "Master Slicer",
        hint: "Once per round; minimum Easy",
        offer: { skills: ["Computers"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
        difficultyFloor: 1,
      },
    ],
  },
  {
    id: "master-starhopper",
    names: ["Master Starhopper"],
    options: [
      {
        id: "master-starhopper",
        label: "Master Starhopper",
        hint: "Once per round; minimum Easy",
        offer: { skills: ["Astrogation"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
        difficultyFloor: 1,
      },
    ],
  },
  {
    id: "master-strategist",
    names: ["Master Strategist"],
    options: [
      {
        id: "master-strategist",
        label: "Master Strategist",
        hint: "Mass Combat check; once per phase",
        offer: { skills: ["Leadership", "Cool", "Discipline", "Knowledge: Warfare"] },
        cost: { strain: 2 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "merciful-shot",
    names: ["Merciful Shot"],
    options: [
      {
        id: "merciful-shot",
        label: "Merciful Shot",
        hint: "Damage as strain",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
        cost: { strain: 2 },
      },
      {
        id: "merciful-shot-stun",
        label: "Merciful Shot: stun",
        hint: "Damage as strain; Stun Damage weapon or Stun setting",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
        cost: { strain: 2 },
        dice: { boost: 2 },
      },
    ],
  },
  {
    id: "momentum",
    names: ["Momentum"],
    options: [
      {
        id: "momentum",
        label: "Momentum",
        hint: "First hit: + damage per range band moved this round",
        offer: { skillTypes: ["Combat"], attack: true },
      },
    ],
  },
  {
    id: "more-machine-than-man-improved",
    names: ["More Machine Than Man (Improved)"],
    options: [
      {
        id: "more-machine-than-man-improved",
        label: "More Machine Than Man (Improved)",
        hint: "Up to half your installed cybernetics, rounded up; say which one helps",
        amount: { label: "Strain" },
        cost: { strain: "amount" },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "multiple-opponents",
    names: ["Multiple Opponents"],
    options: [
      {
        id: "multiple-opponents",
        label: "Multiple Opponents",
        hint: "Engaged with multiple opponents",
        offer: { skills: ["Lightsaber", "Brawl", "Melee"] },
        dice: { boost: 1 },
      },
    ],
  },
  {
    id: "neutralizer",
    names: ["Neutralizer"],
    options: [
      {
        id: "neutralizer",
        label: "Neutralizer",
        hint: "Once per encounter, targeting a poisoned character",
        cost: { strain: 3 },
        dice: { triumph: 1 },
      },
    ],
  },
  {
    id: "no-loose-ends",
    names: ["No Loose Ends"],
    options: [
      {
        id: "no-loose-ends",
        label: "No Loose Ends",
        hint: "Once per session, Destiny Point, a check using your network; it then shrinks by one",
        amount: { label: "Your Willpower" },
        dice: { removeSetback: "amount" },
      },
    ],
  },
  {
    id: "on-the-lookout",
    names: ["On The Lookout"],
    options: [
      {
        id: "on-the-lookout",
        label: "On The Lookout",
        hint: "Initiative, spend a Destiny Point; also allies up to your Cunning",
        offer: { skills: ["Cool", "Vigilance"] },
        dice: { success: 1 },
      },
    ],
  },
  {
    id: "one-shot-one-kill",
    names: ["One Shot, One Kill"],
    options: [
      {
        id: "one-shot-one-kill",
        label: "One Shot, One Kill",
        hint: "+2 Pierce per aim maneuver",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
        amount: { max: 2, label: "Aim maneuvers" },
      },
    ],
  },
  {
    id: "opportunist",
    names: ["Opportunist"],
    options: [
      {
        id: "opportunist",
        label: "Opportunist",
        hint: "Target attacked an ally this round or is distracted",
        offer: { skillTypes: ["Combat"] },
        dice: { boost: "ranks" },
      },
    ],
  },
  {
    id: "outdoorsman",
    names: ["Outdoorsman"],
    options: [
      {
        id: "outdoorsman",
        label: "Outdoorsman",
        hint: "Moving through terrain or managing environmental effects",
        offer: { skills: ["Athletics", "Coordination", "Resilience", "Survival"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "outflank",
    names: ["Outflank"],
    options: [
      {
        id: "outflank",
        label: "Outflank",
        hint: "Once per encounter: after the incidental move, against the chosen enemy",
        offer: { skillTypes: ["Combat"], attack: true },
        dice: { removeSetback: 2 },
      },
    ],
  },
  {
    id: "overcharged-battery",
    names: ["Overcharged Battery*"],
    options: [
      {
        id: "overcharged-battery",
        label: "Overcharged Battery*",
        hint: "Once per round: ship suffers 2 system strain for +2 damage or critical rating −1",
        offer: { skills: ["Gunnery"] },
      },
    ],
  },
  {
    id: "overwhelm-emotions",
    names: ["Overwhelm Emotions"],
    options: [
      {
        id: "overwhelm-emotions",
        label: "Overwhelm Emotions",
        hint: "Light and dark side points add Success or Failure",
        offer: { skills: ["Charm", "Coercion", "Deception"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "overwhelming-aura",
    names: ["Overwhelming Aura"],
    options: [
      {
        id: "overwhelming-aura",
        label: "Overwhelming Aura",
        hint: "Force dice you commit to it; enemies nearby add Threat",
        offer: { skillTypes: ["Social"] },
        amount: { max: "forceRating", label: "Force dice committed" },
        dice: { advantage: "amount" },
      },
    ],
  },
  {
    id: "package-secured",
    names: ["Package Secured"],
    options: [
      {
        id: "package-secured",
        label: "Package Secured",
        hint: "Once per session, Destiny Point, a valuable item at risk; or a Despair on someone else's check to take it (by hand)",
        dice: { triumph: 1 },
      },
    ],
  },
  {
    id: "percussive-maintenance",
    names: ["Percussive Maintenance*"],
    options: [
      {
        id: "percussive-maintenance",
        label: "Percussive Maintenance*",
        hint: "Once per encounter, repair or damage an engaged machine: suffer 2 wounds",
        offer: { skills: ["Mechanics", "Melee", "Brawl"] },
        amount: { label: "Your Melee or Brawl ranks, the higher" },
        cost: { maneuvers: 1 },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "persistent-targeting",
    names: ["Persistent Targeting"],
    options: [
      {
        id: "persistent-targeting",
        label: "Persistent Targeting",
        hint: "Against a target you hit this encounter",
        offer: { skillTypes: ["Combat"] },
        dice: { boost: 1 },
      },
    ],
  },
  {
    id: "planet-mapper",
    names: ["Planet Mapper"],
    options: [
      {
        id: "planet-mapper",
        label: "Planet Mapper",
        hint: "Navigating on a world",
        offer: { skills: ["Streetwise", "Survival"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "port-of-call",
    names: ["Port of Call"],
    options: [
      {
        id: "port-of-call",
        label: "Port of Call",
        hint: "Repairing or resupplying the Flagship at its Port of Call",
        offer: { skills: ["Mechanics", "Negotiation"] },
        dice: { success: 1, advantage: 1 },
      },
    ],
  },
  {
    id: "power-broker",
    names: ["Power Broker"],
    options: [
      {
        id: "power-broker",
        label: "Power Broker",
        hint: "Once per encounter, invoking a patron or organization, or with its members",
        offer: { skillTypes: ["Social"] },
        cost: { strain: 2 },
        dice: { success: 1 },
      },
    ],
  },
  {
    id: "power-broker-improved",
    names: ["Power Broker (Improved)"],
    options: [
      {
        id: "power-broker-improved",
        label: "Power Broker (Improved)",
        hint: "Once per session, instead of Power Broker's Success",
        offer: { skillTypes: ["Social"] },
        cost: { strain: 4 },
        dice: { triumph: 1 },
      },
    ],
  },
  {
    id: "precise-aim",
    names: ["Precise Aim"],
    options: [
      {
        id: "precise-aim",
        label: "Precise Aim",
        hint: "Once per round: target's defense −1 per strain",
        offer: { skillTypes: ["Combat"], attack: true },
        amount: { max: "ranks", label: "Strain" },
        cost: { strain: "amount", maneuvers: 1 },
        dice: { removeSetback: "amount" },
      },
    ],
  },
  {
    id: "precise-aim-improved",
    names: ["Precise Aim (Improved)"],
    options: [
      {
        id: "precise-aim-improved",
        label: "Precise Aim (Improved)",
        hint: "After Precise Aim this round: + Pierce = Precise Aim ranks",
        offer: { skills: ["Brawl", "Lightsaber", "Melee", "Ranged: Light", "Ranged: Heavy"] },
      },
    ],
  },
  {
    id: "pressure-point",
    names: ["Pressure Point"],
    options: [
      {
        id: "pressure-point",
        label: "Pressure Point",
        hint: "Deal damage as strain + Medicine ranks, ignoring soak",
        offer: { skills: ["Brawl"] },
      },
    ],
  },
  {
    id: "prey-on-the-weak",
    names: ["Prey on the Weak"],
    options: [
      {
        id: "prey-on-the-weak",
        label: "Prey on the Weak",
        hint: "Disoriented target: +1 damage per rank to one hit",
        offer: { skillTypes: ["Combat"] },
      },
    ],
  },
  {
    id: "pride-and-joy",
    names: ["Pride and Joy"],
    options: [
      {
        id: "pride-and-joy",
        label: "Pride and Joy",
        hint: "Within short range of your Pride and Joy vessel",
        offer: { skillTypes: ["Social"] },
        dice: { upgradeAbility: 1 },
      },
    ],
  },
  {
    id: "questionable-ethics",
    names: ["Questionable Ethics"],
    options: [
      {
        id: "questionable-ethics",
        label: "Questionable Ethics",
        hint: "Also suffer as much Conflict",
        offer: { skills: ["Medicine", "Coercion"] },
        amount: { max: "ranks", label: "Strain" },
        cost: { strain: "amount" },
        choices: [
          { id: "success", label: "Success", dice: { success: "amount" } },
          { id: "advantage", label: "Advantage", dice: { advantage: "amount" } },
        ],
      },
    ],
  },
  {
    id: "quick-movement",
    names: ["Quick Movement"],
    options: [
      {
        id: "quick-movement",
        label: "Quick Movement",
        hint: "2 Force points: one more Move after the action",
        cost: { strain: 2 },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "quick-strike",
    names: ["Quick Strike"],
    options: [
      {
        id: "quick-strike",
        label: "Quick Strike",
        hint: "Target hasn't acted yet this encounter",
        offer: { skillTypes: ["Combat"] },
        dice: { boost: "ranks" },
      },
    ],
  },
  {
    id: "quick-study",
    names: ["Quick Study"],
    options: [
      {
        id: "quick-study",
        label: "Quick Study",
        hint: "Skill with no ranks",
        amount: { max: "ranks", label: "Strain" },
        cost: { strain: "amount" },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "rain-of-death",
    names: ["Rain of Death"],
    options: [
      {
        id: "rain-of-death",
        label: "Rain of Death",
        hint: "Ignore Auto-fire's added difficulty this turn",
        offer: { skillTypes: ["Combat"], attack: true },
        cost: { maneuvers: 1 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "raise-the-stakes",
    names: ["Raise The Stakes*"],
    options: [
      {
        id: "raise-the-stakes",
        label: "Raise The Stakes*",
        hint: "On success: Advantage equal to the final difficulty",
        cost: { strain: 2 },
        dice: { difficulty: 1, upgradeDifficulty: 1 },
      },
    ],
  },
  {
    id: "rapid-fire",
    names: ["Rapid Fire"],
    options: [
      {
        id: "rapid-fire",
        label: "Rapid Fire",
        hint: "Weapon gains Auto-fire for this attack, then runs out of ammo",
        offer: { skills: ["Ranged: Light"], attack: true },
        dice: { difficulty: 1 },
      },
    ],
  },
  {
    id: "rapid-reaction",
    names: ["Rapid Reaction"],
    options: [
      {
        id: "rapid-reaction",
        label: "Rapid Reaction",
        hint: "Initiative",
        offer: { skills: ["Cool", "Vigilance"] },
        amount: { max: "ranks", label: "Strain" },
        cost: { strain: "amount" },
        dice: { success: "amount" },
      },
    ],
  },
  {
    id: "ravage",
    names: ["Ravage"],
    options: [
      {
        id: "ravage",
        label: "Ravage",
        hint: "Once per encounter, engaged foe; Force point: Success or Advantage",
        offer: { skillTypes: ["Combat"] },
        cost: { strain: 3 },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "read-the-wind-improved",
    names: ["Read the Wind (Improved)"],
    options: [
      {
        id: "read-the-wind-improved",
        label: "Read the Wind (Improved)",
        hint: "Read The Wind as a maneuver",
        offer: { skills: ["Perception"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "ready-for-anything",
    names: ["Ready for Anything"],
    options: [
      {
        id: "ready-for-anything",
        label: "Ready for Anything",
        hint: "Initiative (Cool or Vigilance) or Mass Combat checks",
        offer: { skills: ["Cool", "Vigilance", "Leadership", "Discipline", "Knowledge: Warfare"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "reckless-charge",
    names: ["Reckless Charge"],
    options: [
      {
        id: "reckless-charge",
        label: "Reckless Charge",
        hint: "After a maneuver to engage, this turn",
        offer: { skills: ["Brawl", "Melee", "Lightsaber"] },
        cost: { strain: 2 },
        dice: { success: 2, threat: 2 },
      },
    ],
  },
  {
    id: "relentless",
    names: ["Relentless"],
    options: [
      {
        id: "relentless",
        label: "Relentless",
        hint: "Chasing, tracking or tailing a target",
        amount: { max: "ranks", label: "Strain" },
        cost: { strain: "amount" },
        dice: { downgradeDifficulty: "amount" },
      },
    ],
  },
  {
    id: "respected-delegate",
    names: ["Respected Delegate"],
    options: [
      {
        id: "respected-delegate",
        label: "Respected Delegate",
        hint: "Government institutions outside your homeworld",
        offer: { skillTypes: ["Social"] },
        dice: { downgradeDifficulty: "ranks" },
      },
    ],
  },
  {
    id: "respected-scholar",
    names: ["Respected Scholar"],
    options: [
      {
        id: "respected-scholar",
        label: "Respected Scholar",
        hint: "Interacting with institutes of learning",
        offer: { skillTypes: ["Social"] },
        dice: { downgradeDifficulty: "ranks" },
      },
    ],
  },
  {
    id: "respond-in-kind",
    names: ["Respond In Kind"],
    options: [
      {
        id: "respond-in-kind",
        label: "Respond In Kind",
        hint: "Against the foe whose 3 Threat or Despair you spent",
        offer: { skills: ["Charm", "Negotiation", "Leadership"] },
        dice: { success: 1, advantage: 1 },
      },
    ],
  },
  {
    id: "ride-down",
    names: ["Ride Down"],
    options: [
      {
        id: "ride-down",
        label: "Ride Down",
        hint: "Mounted: + mount's speed damage",
        offer: { skills: ["Melee", "Lightsaber"] },
      },
    ],
  },
  {
    id: "righteous-anger",
    names: ["Righteous Anger"],
    options: [
      {
        id: "righteous-anger",
        label: "Righteous Anger",
        offer: { skills: ["Leadership"] },
        cost: { strain: 2 },
        characteristic: "Willpower",
      },
    ],
  },
  {
    id: "sapith-sundering",
    names: ["Sapith Sundering"],
    options: [
      {
        id: "sapith-sundering",
        label: "Sapith Sundering",
        hint: "Gains Sunder; Force points act as Advantage for it",
        offer: { skills: ["Brawl"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "sarlacc-sweep",
    names: ["Sarlacc Sweep"],
    options: [
      {
        id: "sarlacc-sweep",
        label: "Sarlacc Sweep",
        hint: "Spend 2 Advantage per additional engaged target",
        offer: { skills: ["Lightsaber"] },
        dice: { difficulty: 1 },
      },
    ],
  },
  {
    id: "scathing-tirade-supreme",
    names: ["Scathing Tirade (Supreme)"],
    options: [
      {
        id: "scathing-tirade-supreme",
        label: "Scathing Tirade (Supreme)",
        hint: "Scathing Tirade as a maneuver",
        offer: { skills: ["Coercion"] },
        cost: { strain: 1 },
      },
    ],
  },
  {
    id: "secrets-of-the-jedi",
    names: ["Secrets of the Jedi"],
    options: [
      {
        id: "secrets-of-the-jedi",
        label: "Secrets of the Jedi",
        hint: "Constructing or repairing lightsaber hilts; minimum Easy",
        offer: { skills: ["Mechanics"] },
        amount: { label: "Half your Knowledge (Lore) ranks, rounded up" },
        dice: { difficulty: "-amount" },
        difficultyFloor: 1,
      },
    ],
  },
  {
    id: "sense-danger",
    names: ["Sense Danger"],
    options: [
      {
        id: "sense-danger",
        label: "Sense Danger",
        hint: "Once per session",
        dice: { removeSetback: 2 },
      },
    ],
  },
  {
    id: "short-cut",
    names: ["Short Cut"],
    options: [
      {
        id: "short-cut",
        label: "Short Cut",
        hint: "During a chase: catching or escaping an opponent",
        offer: { skills: ["Piloting: Planetary", "Piloting: Space", "Athletics", "Coordination"] },
        dice: { boost: "ranks" },
      },
    ],
  },
  {
    id: "shortcut-improved",
    names: ["Shortcut (Improved)"],
    options: [
      {
        id: "shortcut-improved",
        label: "Shortcut (Improved)",
        hint: "Chase or race",
        offer: { skills: ["Piloting: Planetary", "Piloting: Space", "Athletics", "Coordination"] },
        amount: { label: "Your Short Cut ranks" },
        cost: { strain: 2 },
        dice: { success: "amount" },
      },
    ],
  },
  {
    id: "showboat",
    names: ["Showboat"],
    options: [
      {
        id: "showboat",
        label: "Showboat",
        hint: "In a starship or vehicle: a Triumph on success, a Despair on failure",
        offer: { skills: ["Piloting: Planetary", "Piloting: Space", "Gunnery"] },
        cost: { strain: 2 },
      },
    ],
  },
  {
    id: "sidearm-diplomacy",
    names: ["Sidearm Diplomacy"],
    options: [
      {
        id: "sidearm-diplomacy",
        label: "Sidearm Diplomacy",
        hint: "Once per encounter",
        offer: { skillTypes: ["Social"] },
        dice: { upgradeDifficulty: 1, success: "ranks" },
      },
    ],
  },
  {
    id: "signature-vehicle",
    names: ["Signature Vehicle"],
    options: [
      {
        id: "signature-vehicle",
        label: "Signature Vehicle",
        hint: "Working on your Signature Vehicle",
        offer: { skills: ["Mechanics"] },
        dice: { upgradeAbility: 1 },
      },
    ],
  },
  {
    id: "signature-vehicle-supreme",
    names: ["Signature Vehicle (Supreme)"],
    options: [
      {
        id: "signature-vehicle-supreme",
        label: "Signature Vehicle (Supreme)",
        hint: "Once per session, Destiny Point: a check involving your Signature Vehicle",
        offer: { skills: ["Piloting: Planetary", "Piloting: Space", "Gunnery", "Mechanics", "Computers"] },
        dice: { triumph: 1 },
      },
    ],
  },
  {
    id: "silent-takedown",
    names: ["Silent Takedown"],
    options: [
      {
        id: "silent-takedown",
        label: "Silent Takedown",
        hint: "Once per encounter, target within short range: silent if it incapacitates",
        offer: { skillTypes: ["Combat"], attack: true },
        cost: { maneuvers: 1 },
      },
    ],
  },
  {
    id: "silent-takedown-improved",
    names: ["Silent Takedown (Improved)"],
    options: [
      {
        id: "silent-takedown-improved",
        label: "Silent Takedown (Improved)",
        hint: "With Silent Takedown",
        offer: { skillTypes: ["Combat"], attack: true },
        dice: { advantage: 2 },
      },
    ],
  },
  {
    id: "sincerest-flattery",
    names: ["Sincerest Flattery"],
    options: [
      {
        id: "sincerest-flattery",
        label: "Sincerest Flattery",
        hint: "Once per encounter: a skill another character used this encounter",
        dice: { boost: 2 },
      },
    ],
  },
  {
    id: "sme",
    names: ["SME*"],
    options: [
      {
        id: "sme",
        label: "SME*",
        hint: "Once per encounter, spend a Destiny Point: your personal experience applies",
        dice: { boost: 3 },
      },
    ],
  },
  {
    id: "sorry-about-the-mess",
    names: ["Sorry About the Mess"],
    options: [
      {
        id: "sorry-about-the-mess",
        label: "Sorry About the Mess",
        hint: "Target hasn't acted yet this encounter: critical rating −1",
        offer: { skillTypes: ["Combat"], attack: true },
      },
    ],
  },
  {
    id: "spice-of-life",
    names: ["Spice of Life"],
    options: [
      {
        id: "spice-of-life",
        label: "Spice of Life",
        hint: "Under the influence of your drugs",
        cost: { strain: 2 },
        dice: { success: 1 },
      },
    ],
  },
  {
    id: "spice-of-life-improved",
    names: ["Spice of Life (Improved)"],
    options: [
      {
        id: "spice-of-life-improved",
        label: "Spice of Life (Improved)",
        hint: "Once per session, on your drugs: instead of Spice of Life's Success",
        cost: { strain: 2 },
        dice: { upgradeDifficulty: 1, triumph: 1 },
      },
    ],
  },
  {
    id: "spur-improved",
    names: ["Spur (Improved)"],
    options: [
      {
        id: "spur-improved",
        label: "Spur (Improved)",
        hint: "Spur as a maneuver; Hard becomes Average",
        offer: { skills: ["Survival"] },
        cost: { strain: 1 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "spymaster",
    names: ["Spymaster"],
    options: [
      {
        id: "spymaster",
        label: "Spymaster",
        hint: "Once per round: creating or using your contact or intelligence network",
        cost: { strain: 2 },
        dice: { difficulty: -1 },
      },
    ],
  },
  {
    id: "steady-nerves-improved",
    names: ["Steady Nerves (Improved)"],
    options: [
      {
        id: "steady-nerves-improved",
        label: "Steady Nerves (Improved)",
        hint: "Once per encounter, precise or dangerous technical check; up to your Steady Nerves ranks",
        amount: { label: "Strain" },
        cost: { strain: "amount" },
        dice: { downgradeDifficulty: "amount" },
      },
    ],
  },
  {
    id: "stim-application-improved",
    names: ["Stim Application (Improved)"],
    options: [
      {
        id: "stim-application-improved",
        label: "Stim Application (Improved)",
        hint: "Stim Application: target suffers only 1 strain",
        offer: { skills: ["Medicine"] },
        dice: { difficulty: 1 },
      },
    ],
  },
  {
    id: "strength-from-passion",
    names: ["Strength From Passion"],
    options: [
      {
        id: "strength-from-passion",
        label: "Strength From Passion",
        hint: "Once per session, spend a Destiny Point (by hand)",
        dice: { success: "destinyDark", threat: "destinyDark" },
      },
    ],
  },
  {
    id: "stunning-blow",
    names: ["Stunning Blow"],
    options: [
      {
        id: "stunning-blow",
        label: "Stunning Blow",
        hint: "Damage as strain (soak applies)",
        offer: { skills: ["Melee"] },
      },
    ],
  },
  {
    id: "suave-and-sophisticated",
    names: ["Suave And Sophisticated"],
    options: [
      {
        id: "suave-and-sophisticated",
        label: "Suave And Sophisticated",
        offer: { skills: ["Deception"] },
        cost: { strain: 2 },
        characteristic: "Presence",
      },
    ],
  },
  {
    id: "surgeon-improved",
    names: ["Surgeon (Improved)*"],
    options: [
      {
        id: "surgeon-improved",
        label: "Surgeon (Improved)",
        hint: "Up to your Surgeon ranks",
        offer: { skills: ["Medicine"] },
        amount: { label: "Strain" },
        cost: { strain: "amount" },
        choices: [
          { id: "boost", label: "Boost", dice: { boost: "amount" } },
          { id: "setback", label: "Remove Setback", dice: { removeSetback: "amount" } },
        ],
      },
    ],
  },
  {
    id: "sustained-fire",
    names: ["Sustained Fire"],
    options: [
      {
        id: "sustained-fire",
        label: "Sustained Fire",
        hint: "Aim at a target you hit this round or last: upgrade instead of the usual aim",
        offer: { skillTypes: ["Combat"], attack: true },
        cost: { maneuvers: 1 },
        dice: { upgradeAbility: 1 },
      },
    ],
  },
  {
    id: "swindler",
    names: ["Swindler*"],
    options: [
      {
        id: "swindler",
        label: "Swindler",
        hint: "Cheating or committing subterfuge",
        offer: { skills: ["Deception", "Skulduggery"] },
        choices: [
          { id: "boost", label: "Boost", dice: { boost: "ranks" } },
          { id: "setback", label: "Remove Setback", dice: { removeSetback: "ranks" } },
        ],
      },
    ],
  },
  {
    id: "tactical-dodge",
    names: ["Tactical Dodge"],
    options: [
      {
        id: "tactical-dodge",
        label: "Tactical Dodge",
        hint: "Against an attacker who missed you after you Dodged",
        offer: { skillTypes: ["Combat"] },
        amount: { label: "Strain spent on Dodge" },
        dice: { upgradeAbility: "amount" },
      },
    ],
  },
  {
    id: "target-acquired-improved",
    names: ["Target Acquired (Improved)"],
    options: [
      {
        id: "target-acquired-improved",
        label: "Target Acquired (Improved)",
        hint: "Target Acquired: 1 Boost die per status effect on the target",
        offer: { skills: ["Coercion"] },
        amount: { label: "Status effects on the target" },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "temple-training",
    names: ["Temple Training"],
    options: [
      {
        id: "temple-training",
        label: "Temple Training",
        hint: "Spend a Destiny Point: + Knowledge (Lore) ranks damage",
        offer: { skills: ["Lightsaber"] },
      },
    ],
  },
  {
    id: "time-splitter",
    names: ["Time-Splitter"],
    options: [
      {
        id: "time-splitter",
        label: "Time-Splitter",
        hint: "Once per encounter: ignore Slow-Firing, or refire with one upgrade per earlier shot",
        offer: { skillTypes: ["Combat"], attack: true },
        amount: { label: "Upgrades" },
        cost: { maneuvers: 1 },
        dice: { upgradeDifficulty: "amount" },
      },
    ],
  },
  {
    id: "touch-of-fate",
    names: ["Touch of Fate"],
    options: [
      {
        id: "touch-of-fate",
        label: "Touch of Fate",
        hint: "Once per session",
        dice: { boost: 2 },
      },
    ],
  },
  {
    id: "trade-in-secrets",
    names: ["Trade In Secrets"],
    options: [
      {
        id: "trade-in-secrets",
        label: "Trade In Secrets",
        hint: "Trading information when buying; the GM sets the Boost dice",
        offer: { skills: ["Negotiation"] },
        amount: { label: "Boost dice (the GM decides)" },
        dice: { boost: "amount" },
      },
    ],
  },
  {
    id: "transmogrify",
    names: ["Transmogrify"],
    options: [
      {
        id: "transmogrify",
        label: "Transmogrify",
        hint: "Crafting; Force point: Success; 2 Force points: Advantage",
        offer: { skills: ["Mechanics"] },
        dice: { force: "forceAvailable" },
      },
    ],
  },
  {
    id: "trick-shot",
    names: ["Trick Shot"],
    options: [
      {
        id: "trick-shot",
        label: "Trick Shot",
        hint: "Setback from the target's cover or a called-shot aim",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
        dice: { removeSetback: 2 },
      },
    ],
  },
  {
    id: "trigger-discipline",
    names: ["Trigger Discipline"],
    options: [
      {
        id: "trigger-discipline",
        label: "Trigger Discipline",
        hint: "Ranged attack",
        offer: { skills: ["Ranged: Light", "Ranged: Heavy", "Gunnery"] },
        amount: { label: "Boost traded (up to your Discipline ranks)" },
        cost: { strain: 2 },
        dice: { advantage: "amount", removeBoost: "amount" },
      },
    ],
  },
  {
    id: "utinni",
    names: ["Utinni!"],
    options: [
      {
        id: "utinni",
        label: "Utinni!",
        hint: "Finding or scavenging items or gear",
        offer: { skills: ["Perception", "Streetwise", "Survival"] },
        dice: { removeSetback: "ranks" },
      },
    ],
  },
  {
    id: "vaapad-control",
    names: ["Vaapad Control"],
    options: [
      {
        id: "vaapad-control",
        label: "Vaapad Control",
        hint: "One downgrade per light side Destiny Point",
        offer: { skills: ["Lightsaber"] },
        cost: { strain: 1 },
        dice: { downgradeDifficulty: "destinyLight" },
      },
    ],
  },
  {
    id: "weapons-free",
    names: ["Weapons Free"],
    options: [
      {
        id: "weapons-free",
        label: "Weapons Free",
        hint: "Once per encounter: ignore Slow-Firing this turn; upgrades = Slow-Firing rank",
        offer: { skillTypes: ["Combat"], attack: true },
        amount: { label: "Slow-Firing rank" },
        cost: { maneuvers: 1 },
        dice: { upgradeDifficulty: "amount" },
      },
    ],
  },
  {
    id: "wheel-deal-improved",
    names: ["Wheel & Deal (Improved)"],
    options: [
      {
        id: "wheel-deal-improved",
        label: "Wheel & Deal (Improved)",
        hint: "Selling goods illegally: +10% credits per Wheel and Deal rank",
        offer: { skills: ["Negotiation", "Streetwise"] },
        dice: { upgradeDifficulty: 1 },
      },
    ],
  },
];
