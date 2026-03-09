import * as THREE from 'three';

/**
 * 54 road waypoints — exact positions from prototype.
 * Index in this array is the waypoint id used in ROAD_GRAPH.
 */
export const WAYPOINTS = [
  new THREE.Vector3(  0, 0,   0),  //  0  plaza centre
  new THREE.Vector3(  0, 0,  -8),  //  1
  new THREE.Vector3(-16, 0,  -8),  //  2
  new THREE.Vector3(-32, 0,  -8),  //  3
  new THREE.Vector3(-48, 0,  -8),  //  4
  new THREE.Vector3(-64, 0,  -8),  //  5
  new THREE.Vector3(-16, 0, -24),  //  6
  new THREE.Vector3(-32, 0, -24),  //  7
  new THREE.Vector3(-48, 0, -24),  //  8
  new THREE.Vector3(-64, 0, -24),  //  9
  new THREE.Vector3(-16, 0, -40),  // 10
  new THREE.Vector3(-32, 0, -40),  // 11
  new THREE.Vector3(-48, 0, -40),  // 12
  new THREE.Vector3(-64, 0, -40),  // 13
  new THREE.Vector3(-16, 0, -56),  // 14
  new THREE.Vector3(-32, 0, -56),  // 15
  new THREE.Vector3(-48, 0, -56),  // 16
  new THREE.Vector3(-64, 0, -56),  // 17
  new THREE.Vector3(-16, 0, -32),  // 18
  new THREE.Vector3(-32, 0, -32),  // 19
  new THREE.Vector3(-32, 0, -48),  // 20
  new THREE.Vector3(-48, 0, -32),  // 21
  new THREE.Vector3(-48, 0, -48),  // 22
  new THREE.Vector3(-64, 0, -32),  // 23
  new THREE.Vector3(-64, 0, -48),  // 24
  new THREE.Vector3(-16, 0, -48),  // 25
  new THREE.Vector3( 24, 0, -24),  // 26
  new THREE.Vector3( 32, 0, -24),  // 27
  new THREE.Vector3( 40, 0, -24),  // 28
  new THREE.Vector3( 24, 0, -40),  // 29
  new THREE.Vector3( 32, 0, -40),  // 30
  new THREE.Vector3( 40, 0, -40),  // 31
  new THREE.Vector3( 24, 0, -56),  // 32
  new THREE.Vector3( 32, 0, -56),  // 33
  new THREE.Vector3( 40, 0, -56),  // 34
  new THREE.Vector3( 24, 0, -32),  // 35
  new THREE.Vector3( 24, 0, -48),  // 36
  new THREE.Vector3( 40, 0, -32),  // 37
  new THREE.Vector3( 40, 0, -48),  // 38
  new THREE.Vector3( 16, 0,  -8),  // 39
  new THREE.Vector3( 32, 0,  -8),  // 40
  new THREE.Vector3( 40, 0,  -8),  // 41
  new THREE.Vector3(  0, 0, -24),  // 42
  new THREE.Vector3(  8, 0, -24),  // 43
  new THREE.Vector3( 22, 0,  12),  // 44
  new THREE.Vector3( 32, 0,  12),  // 45
  new THREE.Vector3( 40, 0,  12),  // 46
  new THREE.Vector3(-32, 0, -36),  // 47
  new THREE.Vector3(-16, 0, -36),  // 48
  new THREE.Vector3( 24, 0, -36),  // 49
  new THREE.Vector3( 24, 0,  20),  // 50
  new THREE.Vector3( 40, 0,  20),  // 51
  new THREE.Vector3(  8, 0, -36),  // 52
  new THREE.Vector3( 20, 0,   0),  // 53
];

/**
 * Adjacency graph for the road network — exact from prototype.
 * Each entry lists the waypoint indices reachable from that waypoint.
 */
export const ROAD_GRAPH = [
  [1, 53],          //  0
  [0, 2, 39, 42],   //  1
  [1, 3, 6],        //  2
  [2, 4, 7],        //  3
  [3, 5, 8],        //  4
  [4, 9],           //  5
  [2, 7, 18, 42],   //  6
  [6, 8, 19],       //  7
  [7, 9, 21],       //  8
  [8, 5, 23],       //  9
  [18, 11, 25],     // 10
  [10, 12, 19, 20], // 11
  [11, 13, 21, 22], // 12
  [12, 9, 23, 24],  // 13
  [25, 15],         // 14
  [14, 16, 20],     // 15
  [15, 17, 22],     // 16
  [16, 24],         // 17
  [6, 10, 48],      // 18
  [7, 11, 47],      // 19
  [11, 15],         // 20
  [8, 12],          // 21
  [12, 16],         // 22
  [9, 13],          // 23
  [13, 17],         // 24
  [10, 14],         // 25
  [41, 27, 35, 43], // 26
  [26, 28],         // 27
  [27, 37],         // 28
  [35, 30, 36, 49], // 29
  [29, 31],         // 30
  [30, 37, 38],     // 31
  [36, 33],         // 32
  [32, 34],         // 33
  [33, 38],         // 34
  [26, 29],         // 35
  [29, 32],         // 36
  [28, 31],         // 37
  [31, 34],         // 38
  [1, 40],          // 39
  [39, 41],         // 40
  [40, 26, 28],     // 41 — NOTE: prototype says [40,26,28] but 28 is already linked via 27
  [1, 43, 6],       // 42
  [42, 26, 52],     // 43
  [53, 45],         // 44
  [44, 46, 50],     // 45
  [45, 51],         // 46
  [19],             // 47
  [18],             // 48
  [29],             // 49
  [45],             // 50
  [46],             // 51
  [43],             // 52
  [0, 44],          // 53
];

/**
 * Maps repo slug → entrance waypoint index (from prototype STRUCTURES).
 * When a mutation arrives the dispatched developer walks to this waypoint
 * first, then the beam fires on arrival.
 */
export const SLUG_TO_WP = {
  'ms-partner-administration':        4,
  'ms-partner-atome':                 8,
  'ms-partner-callback':             47,
  'ms-partner-callback-rate-limiter':12,
  'ms-partner-customer':             15,
  'ms-partner-gateway':              14,
  'ms-partner-integration-platform':  9,
  'ms-partner-registration':         13,
  'ms-partner-transaction':          16,
  'ms-partner-web':                  48,
  'ms-pip-catalog':                  49,
  'ms-pip-gateway':                  28,
  'ms-pip-resource':                 31,
  'ms-pip-transaction':              32,
  'partner-webview-automation-test': 50,
  'partnership-automation':          51,
  'ms-ginpay':                       52,
  'production-support':              53,
};
