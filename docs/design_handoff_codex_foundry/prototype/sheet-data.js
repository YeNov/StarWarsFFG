/* ============================================================
   SW FFG — shared sample character + rules helpers
   Original character (no licensed IP). Edge of the Empire.
   ============================================================ */
(function () {
  // --- the character ---------------------------------------------------
  const CHAR = {
    name: "Kessa Rell",
    player: "—",
    species: "Human",
    career: "Smuggler",
    specialization: "Scoundrel",
    specializations: ["Scoundrel", "Gunslinger", "Charmer"],
    forcePowers: ["Sense", "Move"],
    archetype: "Smuggler · Scoundrel",
    tagline: "Owes everything to no one. Plans to keep it that way.",
    motivation: { type: "Desire", value: "Freedom" },
    credits: 2450,
    forceRating: 1,

    characteristics: { Brawn: 2, Agility: 3, Intellect: 2, Cunning: 3, Willpower: 2, Presence: 3 },

    derived: {
      soak: 3,
      woundThreshold: 12, woundCurrent: 4,
      strainThreshold: 12, strainCurrent: 2,
      defenceRanged: 1, defenceMelee: 0,
      encumbrance: 5, encumbranceMax: 12,
    },

    xp: { total: 180, available: 15 },

    obligations: [
      { type: "Debt", magnitude: 15, note: "Owed to a Hutt cartel" },
      { type: "Bounty", magnitude: 5, note: "Imperial customs flag" },
    ],

    criticalInjuries: [
      { name: "Stunned", severity: 1, desc: "Staggered until the end of her next turn." },
      { name: "Bowled Over", severity: 2, desc: "Knocked prone and suffers 1 strain." },
      { name: "Winded", severity: 3, desc: "Cannot voluntarily suffer strain to activate abilities for 3 rounds." },
    ],

    // skill ranks (anything not listed is rank 0)
    ranks: {
      "Skulduggery": 2, "Deception": 2, "Piloting: Space": 2, "Ranged: Light": 2,
      "Cool": 1, "Streetwise": 1, "Charm": 1, "Perception": 1, "Vigilance": 1,
      "Knowledge: Underworld": 1, "Coordination": 1,
    },
    // career skills (free upgrade context — shown highlighted)
    career: "Smuggler",
    careerSkills: ["Coordination", "Deception", "Knowledge: Underworld", "Perception",
      "Piloting: Space", "Skulduggery", "Streetwise", "Vigilance"],

    weapons: [
      { name: "Heavy Blaster Pistol", skill: "Ranged: Light", dam: 7, crit: 3, range: "Medium", enc: 1,
        special: ["Stun setting", "Pierce 1"], equipped: true },
      { name: "Vibroknife", skill: "Melee", dam: "+1", crit: 2, range: "Engaged", enc: 1,
        special: ["Pierce 2", "Vicious 1"], equipped: true },
      { name: "Customized Shotgun", skill: "Ranged: Heavy", dam: 9, crit: 3, range: "Short", enc: 3,
        special: ["Blast 5", "Knockdown", "Vicious 2"], equipped: false,
        ammo: { cur: 4, max: 6 },
        ammoTypes: ["Slug", "Buckshot", "Stun", "Ion", "Incendiary"], ammoType: "Buckshot" },
    ],

    armor: { name: "Armored Clothing", soak: 1, defence: 1, enc: 2, equipped: true },

    gear: [
      { name: "Comlink (handheld)", enc: 0, qty: 1 },
      { name: "Datapad", enc: 1, qty: 1 },
      { name: "Stimpack", enc: 0, qty: 3 },
      { name: "Scanner goggles", enc: 1, qty: 1 },
      { name: "Binders", enc: 0, qty: 1 },
      { name: "Slicer gear", enc: 2, qty: 1 },
    ],

    talents: [
      { name: "Quick Draw", tier: 1, act: "Incidental", ranked: false,
        desc: "Once per round, draw or holster a weapon as an incidental." },
      { name: "Convincing Demeanour", tier: 1, act: "Passive", ranked: true, rank: 2,
        desc: "Remove ◼ per rank from Deception and Skulduggery checks." },
      { name: "Rapid Reaction", tier: 2, act: "Incidental", ranked: true, rank: 1,
        desc: "Suffer strain to add ▲ to Initiative, up to ranks in Rapid Reaction." },
      { name: "Black Market Contacts", tier: 2, act: "Passive", ranked: true, rank: 1,
        desc: "Reduce rarity of restricted goods; increase cost per rank." },
      { name: "Defensive Driving", tier: 3, act: "Passive", ranked: true, rank: 1,
        desc: "Increase defence of piloted vehicle by 1 per rank." },
    ],

    force: {
      rating: 1,
      power: "Sense",
      committed: 0,
      desc: "Force-sensitive Emergent. Can sense the present — danger and surroundings.",
    },

    bio: "Grew up running cargo on the Outer Rim before she could legally pilot. Bought her own freighter on a loan she's still paying off — to the wrong people. Quick with a blaster, quicker with an excuse.",
  };

  // --- the full EotE skill list (from template.json) -------------------
  const CHAR_OF = {
    "Brawl": "Brawn", "Gunnery": "Agility", "Lightsaber": "Brawn", "Melee": "Brawn",
    "Ranged: Light": "Agility", "Ranged: Heavy": "Agility",
    "Astrogation": "Intellect", "Athletics": "Brawn", "Charm": "Presence",
    "Coercion": "Willpower", "Computers": "Intellect", "Cool": "Presence",
    "Coordination": "Agility", "Deception": "Cunning", "Discipline": "Willpower",
    "Leadership": "Presence", "Mechanics": "Intellect", "Medicine": "Intellect",
    "Negotiation": "Presence", "Perception": "Cunning", "Piloting: Planetary": "Agility",
    "Piloting: Space": "Agility", "Resilience": "Brawn", "Skulduggery": "Cunning",
    "Stealth": "Agility", "Streetwise": "Cunning", "Survival": "Cunning",
    "Vigilance": "Willpower",
    "Knowledge: Core Worlds": "Intellect", "Knowledge: Education": "Intellect",
    "Knowledge: Lore": "Intellect", "Knowledge: Outer Rim": "Intellect",
    "Knowledge: Underworld": "Intellect", "Knowledge: Warfare": "Intellect",
    "Knowledge: Xenology": "Intellect",
  };

  const SKILL_GROUPS = {
    General: ["Astrogation", "Athletics", "Computers", "Cool", "Coordination", "Discipline",
      "Mechanics", "Medicine", "Perception", "Piloting: Planetary", "Piloting: Space",
      "Resilience", "Skulduggery", "Stealth", "Streetwise", "Survival", "Vigilance"],
    Combat: ["Brawl", "Gunnery", "Lightsaber", "Melee", "Ranged: Light", "Ranged: Heavy"],
    Social: ["Charm", "Coercion", "Deception", "Leadership", "Negotiation"],
    Knowledge: ["Knowledge: Core Worlds", "Knowledge: Education", "Knowledge: Lore",
      "Knowledge: Outer Rim", "Knowledge: Underworld", "Knowledge: Warfare", "Knowledge: Xenology"],
  };

  const ABBR = { Brawn: "BR", Agility: "AG", Intellect: "INT", Cunning: "CUN", Willpower: "WIL", Presence: "PR" };

  // --- dice pool math --------------------------------------------------
  // ability dice = characteristic; for each rank upgrade one ability -> proficiency.
  function pool(skill) {
    const ch = CHAR_OF[skill];
    const cval = CHAR.characteristics[ch] || 0;
    const rank = CHAR.ranks[skill] || 0;
    const total = Math.max(cval, rank);
    const prof = Math.min(cval, rank);
    const abil = total - prof;
    return { ability: abil, proficiency: prof, total, characteristic: ch, rank };
  }

  // EotESymbol glyph chars
  const GLYPH = { ability: "d", proficiency: "c", boost: "b", difficulty: "d",
    challenge: "c", setback: "b", force: "a" };

  // helper: array describing each die in a skill pool, for rendering
  function poolDice(skill) {
    const p = pool(skill);
    const arr = [];
    for (let i = 0; i < p.proficiency; i++) arr.push("proficiency");
    for (let i = 0; i < p.ability; i++) arr.push("ability");
    return arr;
  }

  // generic pool math for adversaries / NPCs (own characteristics + ranks)
  function poolDiceWith(cval, rank) {
    const total = Math.max(cval, rank), prof = Math.min(cval, rank);
    const arr = [];
    for (let i = 0; i < prof; i++) arr.push("proficiency");
    for (let i = 0; i < total - prof; i++) arr.push("ability");
    return arr;
  }

  // --- sample vehicle (original light freighter) -----------------------
  const VEHICLE = {
    name: "The Dust Wren",
    model: "Modified Light Freighter",
    type: "Space · Silhouette 4",
    silhouette: 4, speed: 3, speedMax: 4, handling: -1,
    hullTrauma: { cur: 5, max: 22 },
    systemStrain: { cur: 2, max: 18 },
    defence: { fore: 1, port: 1, starboard: 1, aft: 1 },
    armour: 3, sensor: "Short",
    hyperdrive: "Class 2 (backup 12)", consumables: "2 months", navicomputer: true,
    crew: "1 pilot (min)", passengers: 6,
    encumbrance: { cur: 14, max: 22 }, hardpoints: { used: 4, max: 6 },
    cost: 95000, rarity: 4,
    weapons: [
      { name: "Dorsal Laser Cannon", arc: "All", dam: 6, crit: 3, range: "Close", special: ["Linked 1"] },
      { name: "Concussion Missiles", arc: "Forward", dam: 6, crit: 3, range: "Short", special: ["Blast 4", "Guided 3", "Limited Ammo 8"] },
    ],
    attachments: [
      { name: "Smuggling Compartments", desc: "Hidden 4-encumbrance hold; Skulduggery to detect." },
      { name: "Upgraded Sublight Engines", desc: "+1 Speed (already applied above)." },
    ],
    criticalHits: [
      { name: "Loss of Control", severity: 2, desc: "Until the end of the next round, the vehicle can only make the simplest manoeuvres." },
      { name: "Shaken Pilot", severity: 1, desc: "The vehicle's crew adds ■ to all checks until the end of the encounter." },
      { name: "Power Fluctuations", severity: 3, desc: "The vehicle suffers 1 system strain at the start of each round until repaired." },
    ],
    bio: "A patched-together freighter that has outrun more Imperial patrols than it has any right to.",
  };

  // --- sample adversary (Nemesis) --------------------------------------
  const ADVERSARY = {
    name: "Vance Korr", type: "Nemesis", role: "Bounty Hunter", species: "Human",
    tagline: "Always collects. Never asks twice.",
    forcePowers: ["Sense", "Influence"],
    characteristics: { Brawn: 3, Agility: 3, Intellect: 2, Cunning: 3, Willpower: 3, Presence: 2 },
    derived: { soak: 6, woundThreshold: 18, woundCurrent: 0, strainThreshold: 14, strainCurrent: 0, defenceRanged: 1, defenceMelee: 1 },
    skills: { "Ranged: Heavy": 3, "Vigilance": 2, "Cool": 2, "Perception": 2, "Brawl": 2, "Streetwise": 2, "Coercion": 2, "Piloting: Planetary": 1 },
    abilities: [
      { name: "Adversary 2", desc: "Upgrade the difficulty of all combat checks against this target twice." },
      { name: "Quick Strike", desc: "Add ▲▲ to checks against targets that have not yet acted this encounter." },
      { name: "Hunter’s Quarry", desc: "Once per session, locate a marked target’s general whereabouts." },
    ],
    weapons: [
      { name: "Mandalorian Rifle", skill: "Ranged: Heavy", dam: 10, crit: 2, range: "Long", special: ["Pierce 2", "Cumbersome 3"] },
      { name: "Vibro-axe", skill: "Melee", dam: "+3", crit: 2, range: "Engaged", special: ["Pierce 2", "Vicious 2"] },
    ],
    gear: ["Beskar plate (Soak +2, Def +1)", "Jetpack", "Binders", "Tracking beacons ×3"],
  };

  // --- sample minion group ---------------------------------------------
  const MINION = {
    name: "Syndicate Enforcers",
    type: "Minion Group",
    role: "Hired Muscle",
    species: "Mixed",
    tagline: "They don't think. They collect.",
    forcePowers: [],
    groupSize: 4,
    woundPerMinion: 5,
    characteristics: { Brawn: 3, Agility: 2, Intellect: 1, Cunning: 2, Willpower: 2, Presence: 1 },
    soak: 4, defenceRanged: 0, defenceMelee: 0,
    // skills the group is trained in (group adds ranks = members − 1)
    groupSkills: ["Ranged: Light", "Brawl", "Coercion", "Vigilance"],
    weapons: [
      { name: "Blaster Carbine", skill: "Ranged: Light", dam: 9, crit: 3, range: "Medium", special: ["Stun setting"] },
      { name: "Truncheon", skill: "Brawl", dam: "+2", crit: 5, range: "Engaged", special: ["Disorient 2"] },
    ],
    abilities: [
      { name: "Group Rules", desc: "The group makes one combined check; skilled minions add ranks equal to members − 1." },
      { name: "No Strain", desc: "Minions do not track strain; excess damage simply spills toward removing a member." },
    ],
    desc: "Low-level toughs a crime syndicate sends to collect debts and break kneecaps — dangerous in numbers, harmless once thinned out.",
  };

  // --- sample items (detail sheets) ------------------------------------
  const ITEMS = [
    { type: "weapon", name: "Heavy Blaster Pistol", kicker: "Energy Weapon · Ranged: Light",
      restricted: false, state: 1,
      stats: [["Damage", 7], ["Crit", 3], ["Range", "Medium"], ["Encum", 1], ["HP", 3], ["Price", "1,000"], ["Rarity", 4]],
      qualities: ["Stun setting", "Pierce 1"],
      desc: "A rugged sidearm favoured by people who expect trouble — heavier and harder-hitting than a standard blaster, with a stun setting for taking marks alive." },
    { type: "armour", name: "Laminate Armour", kicker: "Armour · Worn", state: 2,
      stats: [["Soak", "+2"], ["Defence", "+0"], ["Encum", 4], ["HP", 1], ["Price", "2,500"], ["Rarity", 5]],
      qualities: ["Cumbersome 2"],
      desc: "Layered plates of pressed armourplast over a padded bodysuit. Common among frontier security and anyone who can't afford something lighter." },
    { type: "gear", name: "Stimpack", kicker: "Consumable · Medical",
      stats: [["Quantity", 3], ["Encum", 0], ["Price", "25"], ["Rarity", 1]],
      qualities: ["Single use"],
      desc: "A pre-loaded injector that heals 5 wounds on application. Each further stimpack used on the same character in one day heals one fewer wound." },
    { type: "talent", name: "Convincing Demeanour", kicker: "Talent · Passive · Tier 1",
      tier: 1, activation: "Passive", ranked: true, rank: 2, forceTalent: false, conflict: false,
      desc: "Remove ◼ per rank of Convincing Demeanour from any Deception or Skulduggery checks the character attempts." },
  ];

  window.SWFFG = {
    CHAR, CHAR_OF, SKILL_GROUPS, ABBR, GLYPH, VEHICLE, ADVERSARY, ITEMS, MINION,
    pool, poolDice, poolDiceWith,
    skillRank: (s) => CHAR.ranks[s] || 0,
    isCareer: (s) => CHAR.careerSkills.includes(s),
  };
})();
