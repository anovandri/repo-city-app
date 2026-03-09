-- ─────────────────────────────────────────────────────────────────
--  Seed: 17 GitLab repositories
--  slug              : used as the stable key linking backend events to FE district config
--  name              : display label shown as the floating building label in the city UI
--  gitlab_project_id : numeric GitLab project ID (stable across renames)
--  district          : city zone — ms-partner | ms-pip | standalone | special
--                        ms-partner  → NW district
--                        ms-pip      → NE district
--                        standalone  → SE standalone area
--                        special     → hand-placed (EOC, sunset)
--  status            : ACTIVE | INACTIVE | MAINTENANCE
--
--  Plain INSERT — safe for H2 (create-drop always starts with empty tables)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO gitlab_repositories (slug, name, gitlab_project_id, icon, open_mrs, status, district, floors) VALUES
  ('ms-partner-administration',        'ms-partner-administration',        37347452, '🛡️',  3, 'ACTIVE',       'ms-partner',  8),
  ('ms-partner-atome',                 'ms-partner-atome',                 42000139, '⚛️',  1, 'ACTIVE',       'ms-partner',  7),
  ('ms-partner-callback',              'ms-partner-callback',              37204819, '🔄',  5, 'ACTIVE',       'ms-partner',  7),
  ('ms-partner-callback-rate-limiter', 'ms-partner-callback-rate-limiter', 55838912, '⏱️',  2, 'ACTIVE',       'ms-partner',  7),
  ('ms-partner-customer',              'ms-partner-customer',              35828382, '👤',  4, 'ACTIVE',       'ms-partner',  7),
  ('ms-partner-gateway',               'ms-partner-gateway',               35163042, '🌐',  0, 'ACTIVE',       'ms-partner',  8),
  ('ms-partner-integration-platform',  'ms-partner-integration-platform',  37347000, '🔗',  7, 'ACTIVE',       'ms-partner',  8),
  ('ms-partner-registration',          'ms-partner-registration',          48122034, '📋',  2, 'ACTIVE',       'ms-partner',  7),
  ('ms-partner-transaction',           'ms-partner-transaction',           36804883, '💸',  6, 'ACTIVE',       'ms-partner',  9),
  ('ms-partner-web',                   'ms-partner-web',                   45029157, '🖥️',  1, 'ACTIVE',       'ms-partner',  7),
  ('ms-pip-catalog',                   'ms-pip-catalog',                   65981776, '📦',  3, 'ACTIVE',       'ms-pip',      7),
  ('ms-pip-gateway',                   'ms-pip-gateway',                   64936428, '💳',  0, 'ACTIVE',       'ms-pip',      8),
  ('ms-pip-resource',                  'ms-pip-resource',                  61779778, '🗄️',  2, 'ACTIVE',       'ms-pip',      7),
  ('ms-pip-transaction',               'ms-pip-transaction',               70763772, '🔀',  4, 'ACTIVE',       'ms-pip',      8),
  ('partner-webview-automation-test',  'partner-webview-automation-test',  39967557, '🤖',  1, 'ACTIVE',       'standalone',  7),
  ('partnership-automation',           'partnership-automation',           38539076, '🤝',  0, 'ACTIVE',       'standalone',  7),
  -- Maintenance/sunset repo — rendered with ⚠️ "SUNSET SOON" badge
  ('ms-ginpay',                        'ms-ginpay',                        14965852, '⚠️',  0, 'MAINTENANCE',  'special',     6),
  -- Production support — always-hot EOC building; rendered with 🚨 "LIVE" badge
  ('production-support',               'production-support',               99000001, '🚨',  8, 'ACTIVE',       'special',    14);

-- ─────────────────────────────────────────────────────────────────
--  Seed: 36 GitLab users
-- ─────────────────────────────────────────────────────────────────
-- gitlab_username matches the GitLab API response format exactly (no @ prefix).
-- The MR / Pipeline API returns { "author": { "username": "anovandri" } } — no @.
-- COMMITs do not carry a username; EventDispatcher resolves author_name → username via
-- GitlabUserRepository.findByDisplayNameIgnoreCase and stores the canonical username.
INSERT INTO gitlab_users (display_name, gitlab_username, gender, role) VALUES
  ('Aditya Novandri',  'anovandri', 'MALE',   'ENGINEER'),
  ('Agung Maulana',    'agungmaulana', 'MALE',   'ENGINEER'),
  ('Agus Triantoro',   'agustriantoro.jago', 'MALE',   'ENGINEER'),
  ('Ali H',            'ali.husein', 'MALE',   'ENGINEER'),
  ('Andes',            'andes.yudanto1', 'MALE',   'ENGINEER'),
  ('Ardi Rizmaldi',    'ardi.rizmaldi', 'MALE',   'ENGINEER'),
  ('Ardy',             'ardy.setiawan', 'MALE',   'ENGINEER'),
  ('Astrid',           'mt-athanasia.irene', 'FEMALE', 'ENGINEER'),
  ('Dani',             'dani-dk', 'MALE',   'ENGINEER'),
  ('Djamal_a_m',       'jamal_a_m', 'MALE',   'ENGINEER'),
  ('Edityo',           'edityo.jago', 'MALE',   'ENGINEER'),
  ('Evan.Rahanda',     'evan.rahanda1', 'MALE',   'ENGINEER'),
  ('Fina',             'fina_fin', 'FEMALE', 'ENGINEER'),
  ('Hasan',            'dk-alimuddinhasan', 'MALE',   'ENGINEER'),
  ('Hedy Simamora',    'hedysimamoradktalis', 'MALE',   'ENGINEER'),
  ('Hendry',           'hendryf', 'MALE',   'ENGINEER'),
  ('Iman',             'iman.jatnika', 'MALE',   'ENGINEER'),
  ('Jamal SA',         'jamal.saepul', 'MALE',   'ENGINEER'),
  ('Kent K',           'kent.kadim-dk', 'MALE',   'CARETAKER'),
  ('Mahen',            'mohamad.mahendra1', 'MALE',   'ENGINEER'),
  ('Meicen',           'dewi.sartika', 'FEMALE', 'ENGINEER'),
  ('Meita',            'meita.chndr', 'FEMALE', 'CARETAKER'),
  ('Nabiila',          'nabiila.adani', 'FEMALE', 'ENGINEER'),
  ('Naura',            'naura.tawab', 'FEMALE', 'ENGINEER'),
  ('Nita',             'sriyunianita', 'FEMALE', 'ENGINEER'),
  ('Rangga',           'rangga.triachyani', 'MALE',   'ENGINEER'),
  ('Reyhan',           'reyhanfabianto', 'MALE',   'ENGINEER'),
  ('Rizki Ekaputri',   'rizkiekaputriii', 'FEMALE', 'ENGINEER'),
  ('Septebrina',       'septebrina.jago', 'FEMALE', 'ENGINEER'),
  ('Sisi Maukar',      'sisi.maukar', 'FEMALE', 'ENGINEER'),
  ('Taufik',           'taufik.nandipinto', 'MALE',   'ENGINEER'),
  ('Tedi Yuwono',      'tedi.yuwono', 'MALE',   'ENGINEER'),
  ('Tommi Irawan',     'tommi.irawan', 'MALE',   'ENGINEER'),
  ('Wina',             'wina.finka1', 'FEMALE', 'ENGINEER'),
  ('Wira',             'siwananda-dk', 'MALE',   'LEADER'),
  ('Yuni Marlina',     'yunimmarlina', 'FEMALE', 'ENGINEER');
