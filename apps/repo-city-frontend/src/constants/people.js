/**
 * All 36 developers in the city.
 * role: 'engineer' | 'caretaker' | 'leader'
 * gender: 'male' | 'female'
 */
export const PEOPLE = [
  { name: 'Aditya Novandri',  gitlab: 'aditya.novandri',   gender: 'male',   role: 'engineer'  },
  { name: 'Agung Maulana',    gitlab: 'agung.maulana',     gender: 'male',   role: 'engineer'  },
  { name: 'Agus Triantoro',   gitlab: 'agus.triantoro',    gender: 'male',   role: 'engineer'  },
  { name: 'Ali H',            gitlab: 'ali.h',             gender: 'male',   role: 'engineer'  },
  { name: 'Andes',            gitlab: 'andes',             gender: 'male',   role: 'engineer'  },
  { name: 'Ardi Rizmaldi',    gitlab: 'ardi.rizmaldi',     gender: 'male',   role: 'engineer'  },
  { name: 'Ardy',             gitlab: 'ardy',              gender: 'male',   role: 'engineer'  },
  { name: 'Astrid',           gitlab: 'astrid',            gender: 'female', role: 'engineer'  },
  { name: 'Dani',             gitlab: 'dani',              gender: 'male',   role: 'engineer'  },
  { name: 'Djamal_a_m',       gitlab: 'djamal_a_m',        gender: 'male',   role: 'engineer'  },
  { name: 'Edityo',           gitlab: 'edityo',            gender: 'male',   role: 'engineer'  },
  { name: 'Evan.Rahanda',     gitlab: 'evan.rahanda',      gender: 'male',   role: 'engineer'  },
  { name: 'Fina',             gitlab: 'fina',              gender: 'female', role: 'engineer'  },
  { name: 'Hasan',            gitlab: 'hasan',             gender: 'male',   role: 'engineer'  },
  { name: 'Hedy Simamora',    gitlab: 'hedy.simamora',     gender: 'male',   role: 'engineer'  },
  { name: 'Hendry',           gitlab: 'hendry',            gender: 'male',   role: 'engineer'  },
  { name: 'Iman',             gitlab: 'iman',              gender: 'male',   role: 'engineer'  },
  { name: 'Jamal SA',         gitlab: 'jamal.sa',          gender: 'male',   role: 'engineer'  },
  { name: 'Kent K',           gitlab: 'kent.k',            gender: 'male',   role: 'caretaker' },
  { name: 'Mahen',            gitlab: 'mahen',             gender: 'male',   role: 'engineer'  },
  { name: 'Meicen',           gitlab: 'meicen',            gender: 'female', role: 'engineer'  },
  { name: 'Meita',            gitlab: 'meita',             gender: 'female', role: 'caretaker' },
  { name: 'Nabiila',          gitlab: 'nabiila',           gender: 'female', role: 'engineer'  },
  { name: 'Naura',            gitlab: 'naura',             gender: 'female', role: 'engineer'  },
  { name: 'Nita',             gitlab: 'nita',              gender: 'female', role: 'engineer'  },
  { name: 'Rangga',           gitlab: 'rangga',            gender: 'male',   role: 'engineer'  },
  { name: 'Reyhan',           gitlab: 'reyhan',            gender: 'male',   role: 'engineer'  },
  { name: 'Rizki Ekaputri',   gitlab: 'rizki.ekaputri',    gender: 'female', role: 'engineer'  },
  { name: 'Septebrina',       gitlab: 'septebrina',        gender: 'female', role: 'engineer'  },
  { name: 'Sisi Maukar',      gitlab: 'sisi.maukar',       gender: 'female', role: 'engineer'  },
  { name: 'Taufik',           gitlab: 'taufik',            gender: 'male',   role: 'engineer'  },
  { name: 'Tedi Yuwono',      gitlab: 'tedi.yuwono',       gender: 'male',   role: 'engineer'  },
  { name: 'Tommi Irawan',     gitlab: 'tommi.irawan',      gender: 'male',   role: 'engineer'  },
  { name: 'Wina',             gitlab: 'wina',              gender: 'female', role: 'engineer'  },
  { name: 'Wira',             gitlab: 'wira',              gender: 'male',   role: 'leader'    },
  { name: 'Yuni Marlina',     gitlab: 'yuni.marlina',      gender: 'female', role: 'engineer'  },
];

/** Fast lookup by gitlab username. */
export const PERSON_BY_GITLAB = Object.fromEntries(PEOPLE.map(p => [p.gitlab, p]));

/** Fast lookup by display name. */
export const PERSON_BY_NAME = Object.fromEntries(PEOPLE.map(p => [p.name, p]));
