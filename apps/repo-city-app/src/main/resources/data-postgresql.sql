-- ─────────────────────────────────────────────────────────────────
--  Seed: 17 GitLab repositories
--  slug              : stable key linking backend events to FE district config
--  name              : display label shown as the floating building label in the city UI
--  gitlab_project_id : numeric GitLab project ID (stable across renames)
--  status            : ACTIVE | INACTIVE | MAINTENANCE
--  ON CONFLICT DO NOTHING = safe to re-run on every boot (prod & dev)
--
--  NOTE: 3D building positions (x, y, z) live in the frontend REPOS config.
-- ─────────────────────────────────────────────────────────────────
INSERT INTO gitlab_repositories (slug, name, gitlab_project_id, icon, open_mrs, status) VALUES
  ('ms-partner-administration',        'ms-partner-administration',        37347452, '🛡️',  3, 'ACTIVE'),
  ('ms-partner-atome',                 'ms-partner-atome',                 42000139, '⚛️',  1, 'ACTIVE'),
  ('ms-partner-callback',              'ms-partner-callback',              37204819, '🔄', 5, 'ACTIVE'),
  ('ms-partner-callback-rate-limiter', 'ms-partner-callback-rate-limiter', 55838912, '⏱️',  2, 'ACTIVE'),
  ('ms-partner-customer',              'ms-partner-customer',              35828382, '👤', 4, 'ACTIVE'),
  ('ms-partner-gateway',               'ms-partner-gateway',               35163042, '🌐', 0, 'ACTIVE'),
  ('ms-partner-registration',          'ms-partner-registration',          48122034, '📋', 2, 'ACTIVE'),
  ('ms-partner-transaction',           'ms-partner-transaction',           36804883, '💸', 6, 'ACTIVE'),
  ('ms-partner-web',                   'ms-partner-web',                   45029157, '🖥️',  1, 'ACTIVE'),
  ('ms-pip-catalog',                   'ms-pip-catalog',                   65981776, '📦', 3, 'ACTIVE'),
  ('ms-pip-gateway',                   'ms-pip-gateway',                   64936428, '💳', 0, 'ACTIVE'),
  ('ms-pip-resource',                  'ms-pip-resource',                  61779778, '🗄️', 2, 'ACTIVE'),
  ('ms-pip-transaction',               'ms-pip-transaction',               70763772, '🔀', 4, 'ACTIVE'),
  ('partner-webview-automation-test',  'partner-webview-automation-test',  39967557, '🤖', 1, 'ACTIVE'),
  ('partnership-automation',           'partnership-automation',           38539076, '🤝', 0, 'ACTIVE'),
  ('ms-ginpay',                        'ms-ginpay',                        14965852, '⚠️', 0, 'MAINTENANCE')
ON CONFLICT (slug) DO NOTHING;

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
  ('Ali Husein',       'ali.husein', 'MALE',   'ENGINEER'),
  ('Andes Haryo Yudanto', 'andes.yudanto1', 'MALE',   'ENGINEER'),
  ('Ardi Rizmaldi',    'ardi.rizmaldi', 'MALE',   'ENGINEER'),
  ('Ardy Setiawan',    'ardy.setiawan', 'MALE',   'ENGINEER'),
  ('Athanasia Irene',  'mt-athanasia.irene', 'FEMALE', 'ENGINEER'),
  ('Dani Fithrantyo',  'dani-dk', 'MALE',   'ENGINEER'),
  ('Djamal Abidin Malik', 'jamal_a_m', 'MALE',   'ENGINEER'),
  ('Swakresna Edityomurti', 'edityo.jago', 'MALE',   'ENGINEER'),
  ('Evan Rahanda',     'evan.rahanda1', 'MALE',   'ENGINEER'),
  ('Fina',             'fina_fin', 'FEMALE', 'ENGINEER'),
  ('Alimuddin Hasan',  'dk-alimuddinhasan', 'MALE',   'ENGINEER'),
  ('Hedy Simamora',    'hedysimamoradktalis', 'MALE',   'ENGINEER'),
  ('Hendry Fu',        'hendryf', 'MALE',   'ENGINEER'),
  ('Iman Jatnika',     'iman.jatnika', 'MALE',   'ENGINEER'),
  ('Jamal Saepul Aziz', 'jamal.saepul', 'MALE',   'ENGINEER'),
  ('Kent Kadim',       'kent.kadim-dk', 'MALE',   'CARETAKER'),
  ('Mohamad Mahendra', 'mohamad.mahendra1', 'MALE',   'ENGINEER'),
  ('Dewi Sartika',     'dewi.sartika', 'FEMALE', 'ENGINEER'),
  ('Meita Ariesta',    'meita.chndr', 'FEMALE', 'CARETAKER'),
  ('Nabiila Adani',    'nabiila.adani', 'FEMALE', 'ENGINEER'),
  ('Naura Hilal',      'naura.tawab', 'FEMALE', 'ENGINEER'),
  ('Sri Yunianita',    'sriyunianita', 'FEMALE', 'ENGINEER'),
  ('Rangga Bayu',      'rangga.triachyani', 'MALE',   'ENGINEER'),
  ('Reyhan Fabianto',  'reyhanfabianto', 'MALE',   'ENGINEER'),
  ('Rizki Ekaputri',   'rizkiekaputriii', 'FEMALE', 'ENGINEER'),
  ('Septebrina',       'septebrina.jago', 'FEMALE', 'ENGINEER'),
  ('Sisi Maukar',      'sisi.maukar', 'FEMALE', 'ENGINEER'),
  ('Taufik Nandipinto', 'taufik.nandipinto', 'MALE',   'ENGINEER'),
  ('Tedi Yuwono',      'tedi.yuwono', 'MALE',   'ENGINEER'),
  ('Tommi Irawan',     'tommi.irawan', 'MALE',   'ENGINEER'),
  ('Wina Finka',       'wina.finka1', 'FEMALE', 'ENGINEER'),
  ('Wira Siwananda',   'siwananda-dk', 'MALE',   'LEADER'),
  ('Yuni Marlina',     'yunimmarlina', 'FEMALE', 'ENGINEER'),
  ('Nathanael Ganata', 'nathanael.ganata', 'MALE', 'ENGINEER')
ON CONFLICT (gitlab_username) DO NOTHING;
