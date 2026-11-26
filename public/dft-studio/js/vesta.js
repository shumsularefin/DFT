(() => {
  'use strict';

  // =========================================================================
  // 1. PERIODIC TABLE & CRYSTALLOGRAPHY REFERENCE DATA (Standard CPK / Jmol)
  // =========================================================================
  const ELEMENTS = {
    H:  { z:1,  mass:1.008,  r:0.37, color:'#f0f0f0' },
    He: { z:2,  mass:4.003,  r:0.32, color:'#d9ffff' },
    Li: { z:3,  mass:6.941,  r:1.34, color:'#cc80ff' },
    Be: { z:4,  mass:9.012,  r:0.90, color:'#c2ff00' },
    B:  { z:5,  mass:10.81,  r:0.82, color:'#ffb5b5' },
    C:  { z:6,  mass:12.011, r:0.77, color:'#505050' },
    N:  { z:7,  mass:14.007, r:0.75, color:'#3050f8' },
    O:  { z:8,  mass:15.999, r:0.73, color:'#e62222' },
    F:  { z:9,  mass:18.998, r:0.71, color:'#90e050' },
    Ne: { z:10, mass:20.180, r:0.69, color:'#b3e3f5' },
    Na: { z:11, mass:22.990, r:1.54, color:'#ab5cf2' },
    Mg: { z:12, mass:24.305, r:1.30, color:'#8aff00' },
    Al: { z:13, mass:26.982, r:1.18, color:'#bfa6a6' },
    Si: { z:14, mass:28.086, r:1.11, color:'#4b7bec' },
    P:  { z:15, mass:30.974, r:1.06, color:'#ff8000' },
    S:  { z:16, mass:32.065, r:1.02, color:'#e8c828' },
    Cl: { z:17, mass:35.453, r:0.99, color:'#1ff01f' },
    K:  { z:19, mass:39.098, r:1.96, color:'#8f40d4' },
    Ca: { z:20, mass:40.078, r:1.74, color:'#3dff00' },
    Sc: { z:21, mass:44.956, r:1.44, color:'#c4c4c4' },
    Ti: { z:22, mass:47.867, r:1.36, color:'#77b5d9', is3d:true, defU:4.0 },
    V:  { z:23, mass:50.942, r:1.25, color:'#a6a6ab', is3d:true, defU:3.25 },
    Cr: { z:24, mass:51.996, r:1.27, color:'#8a99c7', is3d:true, defU:3.7 },
    Mn: { z:25, mass:54.938, r:1.39, color:'#9c7ac7', is3d:true, defU:3.9 },
    Fe: { z:26, mass:55.845, r:1.25, color:'#c87d2e', is3d:true, defU:5.3 },
    Co: { z:27, mass:58.933, r:1.26, color:'#3a6cd4', is3d:true, defU:3.3 },
    Ni: { z:28, mass:58.693, r:1.21, color:'#45b868', is3d:true, defU:6.2 },
    Cu: { z:29, mass:63.546, r:1.38, color:'#c88033', is3d:true, defU:4.0 },
    Zn: { z:30, mass:65.38,  r:1.31, color:'#7d80b0' },
    Ga: { z:31, mass:69.723, r:1.26, color:'#c28f8f' },
    Ge: { z:32, mass:72.64,  r:1.22, color:'#668f8f' },
    As: { z:33, mass:74.922, r:1.19, color:'#bd80e3' },
    Se: { z:34, mass:78.96,  r:1.16, color:'#ffa100' },
    Br: { z:35, mass:79.904, r:1.14, color:'#a62929' },
    Sr: { z:38, mass:87.62,  r:1.92, color:'#00cc00' },
    Y:  { z:39, mass:88.906, r:1.62, color:'#94ffff' },
    Zr: { z:40, mass:91.224, r:1.48, color:'#94e0e0' },
    Nb: { z:41, mass:92.906, r:1.37, color:'#73c2c9' },
    Mo: { z:42, mass:95.96,  r:1.45, color:'#54b5b5' },
    Ru: { z:44, mass:101.07, r:1.26, color:'#248f8f' },
    Pd: { z:46, mass:106.42, r:1.31, color:'#006985' },
    Ag: { z:47, mass:107.87, r:1.53, color:'#c0c0c0' },
    In: { z:49, mass:114.82, r:1.44, color:'#a67573' },
    Sn: { z:50, mass:118.71, r:1.41, color:'#668080' },
    Sb: { z:51, mass:121.76, r:1.38, color:'#9e63b5' },
    Te: { z:52, mass:127.60, r:1.35, color:'#d47a00' },
    I:  { z:53, mass:126.90, r:1.33, color:'#940094' },
    Cs: { z:55, mass:132.91, r:2.25, color:'#57178f' },
    Ba: { z:56, mass:137.33, r:1.98, color:'#22c55e' },
    La: { z:57, mass:138.91, r:1.69, color:'#70d4ff' },
    Ce: { z:58, mass:140.12, r:1.65, color:'#e9e39e', is4f:true, defU:5.0 },
    Pr: { z:59, mass:140.91, r:1.65, color:'#a7f3d0', is4f:true, defU:5.0 },
    Nd: { z:60, mass:144.24, r:1.64, color:'#6ee7b7', is4f:true, defU:6.0 },
    Pm: { z:61, mass:145.00, r:1.63, color:'#34d399', is4f:true, defU:6.0 },
    Sm: { z:62, mass:150.36, r:1.62, color:'#10b981', is4f:true, defU:6.0 },
    Eu: { z:63, mass:151.96, r:1.85, color:'#059669', is4f:true, defU:6.0 },
    Gd: { z:64, mass:157.25, r:1.61, color:'#45ffc7', is4f:true, defU:6.0 },
    Tb: { z:65, mass:158.93, r:1.59, color:'#30ffc7', is4f:true, defU:6.0 },
    Dy: { z:66, mass:162.50, r:1.59, color:'#1fffc7', is4f:true, defU:6.0 },
    Ho: { z:67, mass:164.93, r:1.58, color:'#00ff9c', is4f:true, defU:6.0 },
    Er: { z:68, mass:167.26, r:1.57, color:'#00e675', is4f:true, defU:6.0 },
    Tm: { z:69, mass:168.93, r:1.56, color:'#00d452', is4f:true, defU:6.0 },
    Yb: { z:70, mass:173.05, r:1.70, color:'#00bf38', is4f:true, defU:6.0 },
    Lu: { z:71, mass:174.97, r:1.56, color:'#00ab24' },
    Hf: { z:72, mass:178.49, r:1.50, color:'#4dc2ff' },
    Ta: { z:73, mass:180.95, r:1.38, color:'#4da6ff' },
    W:  { z:74, mass:183.84, r:1.46, color:'#2194d6' },
    Re: { z:75, mass:186.21, r:1.51, color:'#267dab' },
    Os: { z:76, mass:190.23, r:1.44, color:'#266696' },
    Ir: { z:77, mass:192.22, r:1.41, color:'#175487' },
    Pt: { z:78, mass:195.08, r:1.28, color:'#d0d0e0' },
    Au: { z:79, mass:196.97, r:1.44, color:'#ffd123' },
    Hg: { z:80, mass:200.59, r:1.49, color:'#b8b8d0' },
    Tl: { z:81, mass:204.38, r:1.48, color:'#a6544d' },
    Pb: { z:82, mass:207.2,  r:1.47, color:'#575961' },
    Bi: { z:83, mass:208.98, r:1.46, color:'#9e4fb5' },
    Th: { z:90, mass:232.04, r:1.80, color:'#00baff', is4f:true },
    U:  { z:92, mass:238.03, r:1.75, color:'#008fff', is4f:true, defU:4.5 }
  };
  // International Tables Vol. C / Cromer & Mann (1968) 9-parameter X-ray form factors
  // Format: [a1, a2, a3, a4, c, b1, b2, b3, b4] for f0(s) = c + sum(a_i * exp(-b_i * s^2)), s = sin(theta)/lambda
  const CROMER_MANN = {"H":[0.38422,0.36347,0.13816,0.10786,0.00625,10.9071,4.30779,1.33127,25.6848],"He":[0.76844,0.72694,0.27631,0.21572,0.01249,10.9071,4.30779,1.33127,25.6848],"Li":[0.99279,0.87402,0.8424,0.23101,0.05988,4.33979,1.26006,98.7088,212.088],"Be":[2.22744,1.55249,1.4006,0.5829,-1.76339,0.04965,42.9165,1.66379,100.361],"B":[2.03876,1.41491,1.11609,0.73273,-0.30409,23.0888,0.97848,59.8985,0.08538],"C":[1.93019,1.87812,1.57415,0.37108,0.24637,12.7188,28.6498,0.59645,65.0337],"N":[12.7913,3.28546,1.76483,0.54709,-11.3926,0.02064,10.7018,30.7773,1.48044],"O":[2.8604,2.5212,1.5296,0.8135,0.2742,12.7907,5.4279,0.3282,34.9406],"F":[3.30393,3.01753,1.35754,0.83645,0.48398,11.2651,4.66504,0.3376,27.9898],"Ne":[3.71272,3.52631,1.19237,0.8308,0.73728,3.91091,9.63126,0.40483,23.9546],"Na":[5.264,2.17549,1.3669,1.08859,1.09912,4.02579,10.4796,0.84222,133.617],"Mg":[5.59229,2.68206,1.72235,0.73055,1.26883,4.41142,1.36549,93.4885,32.5281],"Al":[5.35047,2.92451,2.27309,1.16531,1.28489,3.48665,1.20535,42.6051,107.17],"Si":[5.79411,3.2239,2.42795,1.32149,1.23139,2.57104,34.1775,0.86937,85.341],"P":[6.92073,4.14396,2.01697,1.5386,0.3787,1.83778,27.0198,0.21318,67.1086],"S":[7.0699,5.3398,2.2363,1.5118,-0.1592,1.3659,19.8279,0.0921,55.2283],"Cl":[9.83957,7.53181,6.071,1.87128,-8.3143,-0.00053,1.11119,18.0846,45.3666],"Ar":[16.8752,8.32256,6.91326,2.18515,-16.2972,-0.01456,0.8331,14.9177,37.2256],"K":[8.11756,7.48062,1.07795,0.97218,1.35009,12.6684,0.76409,211.222,37.2727],"Ca":[8.60272,7.50769,1.75117,0.96216,1.1743,10.2636,0.62794,149.301,60.2274],"Sc":[9.06482,7.55526,2.05017,1.28745,1.03849,8.77431,0.53306,123.88,36.889],"Ti":[9.54969,7.60067,2.17223,1.75438,0.91762,7.60579,0.45899,109.099,27.5715],"V":[10.0661,7.6142,2.23551,2.2317,0.84574,6.67721,0.40322,98.5954,22.572],"Cr":[10.4757,7.51402,3.50115,1.54902,0.95226,6.01658,0.37426,19.0654,97.4599],"Mn":[11.2519,7.36935,3.04107,2.27703,1.05195,5.34818,0.34373,17.4089,84.2139],"Fe":[11.9185,7.04848,3.34326,2.27228,1.40818,4.87394,0.34023,15.933,79.0339],"Co":[12.5158,6.63642,3.57722,2.25644,1.91452,4.48994,0.35459,14.8402,74.7352],"Ni":[13.3239,6.18746,3.74792,2.23195,2.49899,4.17742,0.38682,14.0123,71.1195],"Cu":[13.9352,5.84833,4.64221,1.44753,3.11686,3.97779,0.44555,13.3971,74.1605],"Zn":[14.6744,5.62816,3.9254,2.16398,3.59838,3.71486,0.50033,12.8862,65.4071],"Ga":[15.3412,5.7415,3.10733,2.52764,4.26842,3.63868,0.6564,16.0719,70.7609],"Ge":[15.4378,6.00432,3.05158,2.93572,4.56068,3.39715,0.73097,18.9533,63.7969],"As":[15.4043,6.13723,3.74679,3.0139,4.69149,3.07517,0.74113,21.0014,57.7446],"Se":[15.5372,5.98288,4.83966,2.93549,4.70026,2.7153,0.68926,21.0079,52.4308],"Br":[15.9934,6.02439,5.51599,2.88716,4.57602,2.35651,19.7393,0.58143,47.3323],"Kr":[16.8494,7.1979,4.92564,2.91606,4.10864,2.01856,18.0409,0.39741,42.5054],"Rb":[11.4809,9.46904,9.16981,1.42608,5.43921,1.0814,18.28,2.38825,185.293],"Sr":[11.6164,9.73009,8.68081,2.60986,5.34841,1.85574,14.6109,0.89852,139.83],"Y":[19.0567,6.50783,4.81524,2.84786,5.76121,1.24615,9.68019,18.8903,121.353],"Zr":[19.2273,10.1378,2.48177,2.42892,5.71886,1.15488,10.7877,120.126,33.3722],"Nb":[19.3496,10.8737,3.47687,1.64516,5.65073,1.06626,10.5977,32.6174,120.397],"Mo":[19.3885,11.8308,3.75919,1.46772,5.55047,0.97877,10.0885,31.9738,117.932],"Tc":[19.3597,12.8087,3.41372,1.99926,5.41556,0.89356,9.27497,32.3513,107.406],"Ru":[19.4316,13.7309,4.26537,1.2872,5.28192,0.82092,8.97737,28.2621,111.501],"Rh":[19.4524,14.6845,4.5024,1.2474,5.11007,0.75019,8.42622,26.1564,107.78],"Pd":[19.5123,15.38,5.3833,0.81015,4.91427,0.68583,7.95714,23.1808,65.9295],"Ag":[19.5284,16.5811,4.9915,1.21404,4.68114,0.62387,7.39504,22.2282,100.226],"Cd":[19.5528,17.5717,4.47374,1.98562,4.41158,0.56604,6.7963,21.2907,85.2777],"In":[19.5872,18.7169,4.02722,2.51452,4.14542,0.5151,6.2943,22.7308,88.5675],"Sn":[19.6527,19.5108,3.86895,3.14764,3.81227,0.46604,5.76321,24.0627,78.1533],"Sb":[20.0755,19.7766,4.30389,3.44952,3.38881,5.24328,0.41858,26.0178,70.1646],"Te":[20.4608,20.0336,5.38664,3.33079,2.78462,4.74225,0.37041,27.3458,65.0573],"I":[20.7492,20.564,6.86158,2.97589,1.84739,4.27091,0.3196,27.3186,61.5375],"Xe":[21.6679,21.0085,8.43382,2.62265,0.26635,0.26422,3.83526,26.2297,58.483],"Cs":[22.3163,21.1792,10.7382,1.46163,-0.70709,0.23092,3.49464,25.1864,232.82899],"Ba":[27.7489,21.3777,11.04,2.68186,-6.85854,0.15152,3.09817,20.6774,178.819],"La":[33.2109,21.7181,11.6222,3.17239,-12.7404,0.1104,2.83641,19.3886,144.438],"Ce":[29.41,22.2428,11.9818,3.19259,-8.8456,0.12335,2.74837,18.3794,139.603],"Pr":[22.922,22.2518,12.2269,2.72431,-1.1393,2.78604,0.18015,17.6663,160.91499],"Nd":[23.4069,19.7073,12.5016,2.7285,1.64038,2.71587,0.2095,16.9122,156.556],"Pm":[23.848,17.5535,12.7324,2.72975,4.12018,2.65746,0.2478,16.2463,152.68201],"Sm":[24.2242,15.9132,12.9238,2.72836,6.19355,2.60993,0.29475,15.6554,149.22099],"Eu":[24.5148,14.80579,13.0799,2.72477,7.85731,2.57255,0.3493,15.128,146.103],"Gd":[24.4004,14.0308,13.1754,3.24472,9.12488,2.47491,0.4023,14.467,119.73804],"Tb":[24.3736,13.8649,13.251,3.24435,10.242,2.46637,0.47517,14.0424,117.446],"Dy":[24.6193,14.2735,13.3567,2.70316,11.029,2.52208,0.54556,13.8487,138.385],"Ho":[24.3162,14.9012,13.3895,2.69309,11.6817,2.52724,0.61572,13.5041,136.246],"Er":[23.8201,15.8796,13.3938,2.6819,12.2062,2.54419,0.68445,13.1932,134.282],"Tm":[23.1386,17.1707,13.3703,2.66981,12.6322,2.5732,0.74948,12.9126,132.468],"Yb":[22.3028,18.7202,13.32,2.65701,12.9818,2.61393,0.80868,12.659,130.78301],"Lu":[21.1866,20.176,13.0532,3.2119,13.3489,0.88654,2.6861,12.2746,107.128],"Hf":[24.6725,17.2295,12.8069,3.5597,13.7049,0.974,2.89038,12.2897,93.4381],"Ta":[28.1757,14.4288,12.6412,3.74436,13.9824,1.04034,3.20784,12.5054,85.0183],"W":[31.0935,12.5273,12.3769,3.79138,14.1842,1.07885,12.8331,3.63298,79.7647],"Re":[33.2961,12.3497,11.2819,3.72367,14.3239,1.09315,13.2559,4.16736,76.6562],"Os":[34.8667,11.9524,11.1851,3.56436,14.4097,1.0884,13.8042,4.79179,75.1399],"Ir":[35.9454,11.998,11.2501,3.34312,14.4449,1.06924,5.43443,14.4983,74.7918],"Pt":[36.8102,13.0747,11.3323,2.31421,14.4526,1.04422,6.0734,15.7018,73.8375],"Au":[37.3027,14.9306,10.3425,2.01229,14.3992,1.0081,6.5255,16.51,76.9117],"Hg":[37.5186,17.0353,8.51121,2.6334,14.2911,0.96455,6.65786,16.8438,76.7228],"Tl":[37.6947,19.7195,6.3829,3.0096,14.18,0.92263,6.78248,19.2435,85.9267],"Pb":[37.7383,21.3394,5.17527,3.71604,14.0203,0.87755,6.58964,21.2437,78.8094],"Bi":[37.7143,22.4542,4.84549,4.14816,13.8301,0.83222,6.27051,24.4693,72.1558],"Po":[37.6297,23.1323,5.59203,4.04218,13.5991,0.7864,5.86644,27.8678,68.1617],"At":[37.4971,23.5635,7.15953,3.45924,13.3183,0.74012,5.42694,29.835,66.3564],"Rn":[37.3308,23.8933,9.02222,2.77349,12.9796,0.69354,4.98696,30.0338,65.5799],"Fr":[37.1902,24.1306,11.5026,1.4798,12.6868,0.65303,4.61305,29.2597,257.965],"Ra":[36.982,24.2495,11.8719,2.72428,12.1642,0.60394,4.17857,24.3782,200.024],"Ac":[36.8705,24.7131,12.3889,3.26501,11.7484,0.56458,3.88776,23.1506,161.726],"Th":[36.7754,25.2506,13.0681,3.63791,11.2497,0.5251,3.61658,22.341,139.164],"Pa":[37.1457,25.2998,13.7846,3.29611,11.4561,0.5202,3.663,20.6539,150.97301],"U":[37.2808,25.6563,14.3501,3.30732,11.3864,0.50239,3.58562,19.6342,146.633]};

  function cromerMannF0(el, sVal) {
    const c = CROMER_MANN[el];
    if (!c) return (getElInfo(el).z || 10) * Math.exp(-1.5 * sVal * sVal);
    const s2 = sVal * sVal;
    return c[4] + c[0]*Math.exp(-c[5]*s2) + c[1]*Math.exp(-c[6]*s2) + c[2]*Math.exp(-c[7]*s2) + c[3]*Math.exp(-c[8]*s2);
  }

  // Published Brown & Altermatt (1985) / Brese & O'Keeffe (1991) Bond Valence Parameters R0 (Å), B = 0.37 Å
  const BVS_PARAMS = {
    'Li-O': [{ox:'+1', R0:1.466}], 'Na-O': [{ox:'+1', R0:1.803}], 'K-O': [{ox:'+1', R0:2.132}],
    'Mg-O': [{ox:'+2', R0:1.693}], 'Ca-O': [{ox:'+2', R0:1.967}], 'Sr-O': [{ox:'+2', R0:2.118}], 'Ba-O': [{ox:'+2', R0:2.285}],
    'Al-O': [{ox:'+3', R0:1.651}], 'Si-O': [{ox:'+4', R0:1.624}], 'Ga-O': [{ox:'+3', R0:1.730}], 'Ge-O': [{ox:'+4', R0:1.748}],
    'Sc-O': [{ox:'+3', R0:1.849}], 'Y-O':  [{ox:'+3', R0:2.014}], 'Zr-O': [{ox:'+4', R0:1.937}], 'Nb-O': [{ox:'+5', R0:1.911}],
    'Ti-O': [{ox:'+4', R0:1.815}, {ox:'+3', R0:1.791}],
    'V-O':  [{ox:'+5', R0:1.803}, {ox:'+4', R0:1.784}, {ox:'+3', R0:1.743}],
    'Cr-O': [{ox:'+3', R0:1.724}, {ox:'+4', R0:1.740}],
    'Mn-O': [{ox:'+3', R0:1.760}, {ox:'+2', R0:1.790}, {ox:'+4', R0:1.753}],
    'Fe-O': [{ox:'+3', R0:1.759}, {ox:'+2', R0:1.734}],
    'Co-O': [{ox:'+3', R0:1.700}, {ox:'+2', R0:1.692}],
    'Ni-O': [{ox:'+2', R0:1.654}, {ox:'+3', R0:1.686}],
    'Cu-O': [{ox:'+2', R0:1.679}, {ox:'+3', R0:1.730}],
    'Zn-O': [{ox:'+2', R0:1.704}], 'Sn-O': [{ox:'+4', R0:1.905}], 'Pb-O': [{ox:'+2', R0:2.112}], 'Bi-O': [{ox:'+3', R0:2.094}],
    'La-O': [{ox:'+3', R0:2.172}], 'Ce-O': [{ox:'+3', R0:2.151}, {ox:'+4', R0:2.028}],
    'Pr-O': [{ox:'+3', R0:2.135}], 'Nd-O': [{ox:'+3', R0:2.117}], 'Sm-O': [{ox:'+3', R0:2.088}],
    'Eu-O': [{ox:'+3', R0:2.076}], 'Gd-O': [{ox:'+3', R0:2.065}], 'Tb-O': [{ox:'+3', R0:2.049}],
    'Dy-O': [{ox:'+3', R0:2.036}], 'Ho-O': [{ox:'+3', R0:2.023}], 'Er-O': [{ox:'+3', R0:2.010}],
    'Yb-O': [{ox:'+3', R0:1.985}], 'Lu-O': [{ox:'+3', R0:1.971}],
    'Mo-S': [{ox:'+4', R0:2.160}], 'W-S':  [{ox:'+4', R0:2.170}], 'Fe-S': [{ox:'+2', R0:2.160}],
    'Cu-S': [{ox:'+1', R0:1.860}, {ox:'+2', R0:2.054}], 'Zn-S': [{ox:'+2', R0:2.090}],
    'Ca-F': [{ox:'+2', R0:1.842}], 'Li-F': [{ox:'+1', R0:1.360}], 'Na-F': [{ox:'+1', R0:1.677}], 'Si-F': [{ox:'+4', R0:1.534}]
  };

  function computeSiteBVS(el, neighbors) {
    // Compute Brown-Altermatt BVS = sum(exp((R0 - d)/0.37)) over ligand bonds within 3.2 Å
    const ligs = neighbors.filter(nb => nb.d <= 3.25);
    if (ligs.length === 0) return null;
    const isAnion = ANION_SET.has(el);
    if (!isAnion) {
      const domLig = ligs[0].el;
      const entries = BVS_PARAMS[`${el}-${domLig}`];
      if (!entries) return null;
      return entries.map(({ ox, R0 }) => {
        let sum = 0;
        for (const nb of ligs) {
          if (nb.el === domLig) sum += Math.exp((R0 - nb.d) / 0.37);
        }
        return { label: `${el}${ox}`, val: sum, R0 };
      });
    } else {
      // Anion BVS: sum contributions from each bonded cation species (using primary oxidation state)
      let sum = 0, used = false;
      for (const nb of ligs) {
        const entries = BVS_PARAMS[`${nb.el}-${el}`];
        if (entries && entries.length > 0) {
          sum += Math.exp((entries[0].R0 - nb.d) / 0.37);
          used = true;
        }
      }
      return used ? [{ label: `${el}⁻`, val: sum, R0: null }] : null;
    }
  }

  function getElInfo(el) {
    return ELEMENTS[el] || { z:0, mass:50.0, r:1.2, color:'#94a3b8' };
  }

  // Standard High-Symmetry k-Paths (Setyawan & Curtarolo 2010)
  const KPATHS = {
    'Cubic-P': {
      path: 'Γ → X → M → Γ → R → X | M → R',
      segments: [['G','X'],['X','M'],['M','G'],['G','R'],['R','X'],['M','R']],
      pts: { G:[0,0,0], X:[0,0.5,0], M:[0.5,0.5,0], R:[0.5,0.5,0.5] }
    },
    'Cubic-F': {
      path: 'Γ → X → W → K → Γ → L → U → W → L → K',
      segments: [['G','X'],['X','W'],['W','K'],['K','G'],['G','L'],['L','U'],['U','W'],['W','L'],['L','K']],
      pts: { G:[0,0,0], X:[0.5,0,0.5], W:[0.5,0.25,0.75], K:[0.375,0.375,0.75], L:[0.5,0.5,0.5], U:[0.625,0.25,0.625] }
    },
    'Cubic-I': {
      path: 'Γ → H → N → Γ → P → H | P → N',
      segments: [['G','H'],['H','N'],['N','G'],['G','P'],['P','H'],['P','N']],
      pts: { G:[0,0,0], H:[0.5,-0.5,0.5], N:[0,0,0.5], P:[0.25,0.25,0.25] }
    },
    'Tetragonal': {
      path: 'Γ → X → M → Γ → Z → R → A → Z',
      segments: [['G','X'],['X','M'],['M','G'],['G','Z'],['Z','R'],['R','A'],['A','Z']],
      pts: { G:[0,0,0], X:[0,0.5,0], M:[0.5,0.5,0], Z:[0,0,0.5], R:[0,0.5,0.5], A:[0.5,0.5,0.5] }
    },
    'Hexagonal': {
      path: 'Γ → M → K → Γ → A → L → H → A',
      segments: [['G','M'],['M','K'],['K','G'],['G','A'],['A','L'],['L','H'],['H','A']],
      pts: { G:[0,0,0], M:[0.5,0,0], K:[0.333333,0.333333,0], A:[0,0,0.5], L:[0.5,0,0.5], H:[0.333333,0.333333,0.5] }
    },
    'Orthorhombic': {
      path: 'Γ → X → S → Y → Γ → Z → U → R → T → Z',
      segments: [['G','X'],['X','S'],['S','Y'],['Y','G'],['G','Z'],['Z','U'],['U','R'],['R','T'],['T','Z']],
      pts: { G:[0,0,0], X:[0.5,0,0], S:[0.5,0.5,0], Y:[0,0.5,0], Z:[0,0,0.5], U:[0.5,0,0.5], R:[0.5,0.5,0.5], T:[0,0.5,0.5] }
    },
    'Monoclinic': {
      path: 'Γ → Y → H → C → E → M1 → A → X → Γ',
      segments: [['G','Y'],['Y','C'],['C','E'],['E','A'],['A','X'],['X','G']],
      pts: { G:[0,0,0], Y:[0,0.5,0], C:[0,0.5,0.5], E:[-0.5,0.5,0.5], A:[-0.5,0,0], X:[0.5,0,0] }
    },
    'Triclinic': {
      path: 'Γ → X → Y → Γ → Z → R',
      segments: [['G','X'],['X','Y'],['Y','G'],['G','Z'],['Z','R']],
      pts: { G:[0,0,0], X:[0.5,0,0], Y:[0,0.5,0], Z:[0,0,0.5], R:[0.5,0.5,0.5] }
    }
  };

  // =========================================================================
  // 2. BUILT-IN VASP SAMPLE STRUCTURES
  // =========================================================================
  const SAMPLES = {
    nio_afm: {
      name: 'NiO (AFM-II Rocksalt)',
      cifSG: 'Fm-3m (225)',
      lattice: [[4.177,0,0],[0,4.177,0],[0,0,4.177]],
      selectiveDynamics: false,
      polyCenters: ['Ni'],
      atoms: [
        { el:'Ni', frac:[0,0,0],       mag:[0,0, 2.0], sel:[true,true,true] },
        { el:'Ni', frac:[0,0.5,0.5],   mag:[0,0,-2.0], sel:[true,true,true] },
        { el:'Ni', frac:[0.5,0,0.5],   mag:[0,0,-2.0], sel:[true,true,true] },
        { el:'Ni', frac:[0.5,0.5,0],   mag:[0,0, 2.0], sel:[true,true,true] },
        { el:'O',  frac:[0.5,0.5,0.5], mag:[0,0,0],    sel:[true,true,true] },
        { el:'O',  frac:[0.5,0,0],     mag:[0,0,0],    sel:[true,true,true] },
        { el:'O',  frac:[0,0.5,0],     mag:[0,0,0],    sel:[true,true,true] },
        { el:'O',  frac:[0,0,0.5],     mag:[0,0,0],    sel:[true,true,true] }
      ]
    },
    batio3: {
      name: 'BaTiO3 (Tetragonal Perovskite)',
      cifSG: 'P4mm (99)',
      lattice: [[3.992,0,0],[0,3.992,0],[0,0,4.036]],
      selectiveDynamics: false,
      polyCenters: ['Ti'],
      atoms: [
        { el:'Ba', frac:[0,0,0],           mag:[0,0,0], sel:[true,true,true] },
        { el:'Ti', frac:[0.5,0.5,0.514],   mag:[0,0,0], sel:[true,true,true] },
        { el:'O',  frac:[0.5,0.5,0.975],   mag:[0,0,0], sel:[true,true,true] },
        { el:'O',  frac:[0.5,0.0,0.486],   mag:[0,0,0], sel:[true,true,true] },
        { el:'O',  frac:[0.0,0.5,0.486],   mag:[0,0,0], sel:[true,true,true] }
      ]
    },
    fe_bcc: {
      name: 'Fe (BCC Ferromagnetic)',
      cifSG: 'Im-3m (229)',
      lattice: [[2.866,0,0],[0,2.866,0],[0,0,2.866]],
      selectiveDynamics: false,
      polyCenters: [],
      atoms: [
        { el:'Fe', frac:[0,0,0],       mag:[0,0,2.22], sel:[true,true,true] },
        { el:'Fe', frac:[0.5,0.5,0.5], mag:[0,0,2.22], sel:[true,true,true] }
      ]
    },
    mos2_2d: {
      name: 'MoS2 (2D Monolayer + Vacuum)',
      cifSG: 'P-6m2 (187)',
      lattice: [[3.160,0,0],[-1.580,2.73664,0],[0,0,16.0]],
      selectiveDynamics: true,
      polyCenters: ['Mo'],
      atoms: [
        { el:'Mo', frac:[0.33333,0.66667,0.50000], mag:[0,0,0], sel:[true,true,true] },
        { el:'S',  frac:[0.66667,0.33333,0.40219], mag:[0,0,0], sel:[false,false,false] },
        { el:'S',  frac:[0.66667,0.33333,0.59781], mag:[0,0,0], sel:[true,true,true] }
      ]
    },
    fe2o3: {
      name: 'Fe2O3 (Corundum AFM)',
      cifSG: 'R-3c (167)',
      lattice: [[5.035,0,0],[-2.5175,4.36044,0],[0,0,13.747]],
      selectiveDynamics: false,
      polyCenters: ['Fe'],
      atoms: [
        { el:'Fe', frac:[0,0,0.3553],           mag:[0,0, 4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0,0,0.1447],           mag:[0,0,-4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0,0,0.8553],           mag:[0,0,-4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0,0,0.6447],           mag:[0,0, 4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0.6667,0.3333,0.6886], mag:[0,0, 4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0.6667,0.3333,0.4780], mag:[0,0,-4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0.6667,0.3333,0.1886], mag:[0,0,-4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0.6667,0.3333,0.9780], mag:[0,0, 4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0.3333,0.6667,0.0220], mag:[0,0, 4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0.3333,0.6667,0.8114], mag:[0,0,-4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0.3333,0.6667,0.5220], mag:[0,0,-4.2], sel:[true,true,true] },
        { el:'Fe', frac:[0.3333,0.6667,0.3114], mag:[0,0, 4.2], sel:[true,true,true] },
        { el:'O',  frac:[0.3059,0,0.25],        mag:[0,0,0], sel:[true,true,true] },
        { el:'O',  frac:[0,0.3059,0.25],        mag:[0,0,0], sel:[true,true,true] },
        { el:'O',  frac:[0.6941,0.6941,0.25],   mag:[0,0,0], sel:[true,true,true] },
        { el:'O',  frac:[0.6941,0,0.75],        mag:[0,0,0], sel:[true,true,true] },
        { el:'O',  frac:[0,0.6941,0.75],        mag:[0,0,0], sel:[true,true,true] },
        { el:'O',  frac:[0.3059,0.3059,0.75],   mag:[0,0,0], sel:[true,true,true] }
      ]
    },
    si_diamond: {
      name: 'Si (Diamond Cubic)',
      cifSG: 'Fd-3m (227)',
      lattice: [[5.431,0,0],[0,5.431,0],[0,0,5.431]],
      selectiveDynamics: false,
      polyCenters: [],
      atoms: [
        { el:'Si', frac:[0,0,0],          mag:[0,0,0], sel:[true,true,true] },
        { el:'Si', frac:[0,0.5,0.5],      mag:[0,0,0], sel:[true,true,true] },
        { el:'Si', frac:[0.5,0,0.5],      mag:[0,0,0], sel:[true,true,true] },
        { el:'Si', frac:[0.5,0.5,0],      mag:[0,0,0], sel:[true,true,true] },
        { el:'Si', frac:[0.25,0.25,0.25], mag:[0,0,0], sel:[true,true,true] },
        { el:'Si', frac:[0.25,0.75,0.75], mag:[0,0,0], sel:[true,true,true] },
        { el:'Si', frac:[0.75,0.25,0.75], mag:[0,0,0], sel:[true,true,true] },
        { el:'Si', frac:[0.75,0.75,0.25], mag:[0,0,0], sel:[true,true,true] }
      ]
    }
  };

  // =========================================================================
  // 3. LINEAR ALGEBRA & CRYSTALLOGRAPHY MATH UTILITIES
  // =========================================================================
  const vAdd = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const vSub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const vScale = (a,s) => [a[0]*s, a[1]*s, a[2]*s];
  const vDot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const vCross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const vNorm = (a) => Math.sqrt(vDot(a,a));
  const vUnit = (a) => { const n = vNorm(a); return n > 1e-12 ? vScale(a, 1/n) : [0,0,1]; };
  const wrap01 = (x) => { let y = x - Math.floor(x); if (y >= 1 - 1e-9 || Math.abs(y) < 1e-9) y = 0; return y; };

  function matDet3(m) {
    return (
      m[0][0]*(m[1][1]*m[2][2] - m[1][2]*m[2][1]) -
      m[0][1]*(m[1][0]*m[2][2] - m[1][2]*m[2][0]) +
      m[0][2]*(m[1][0]*m[2][1] - m[1][1]*m[2][0])
    );
  }
  function matInv3(m) {
    const d = matDet3(m);
    if (Math.abs(d) < 1e-12) return null;
    const invD = 1 / d;
    return [
      [(m[1][1]*m[2][2]-m[1][2]*m[2][1])*invD, (m[0][2]*m[2][1]-m[0][1]*m[2][2])*invD, (m[0][1]*m[1][2]-m[0][2]*m[1][1])*invD],
      [(m[1][2]*m[2][0]-m[1][0]*m[2][2])*invD, (m[0][0]*m[2][2]-m[0][2]*m[2][0])*invD, (m[0][2]*m[1][0]-m[0][0]*m[1][2])*invD],
      [(m[1][0]*m[2][1]-m[1][1]*m[2][0])*invD, (m[0][1]*m[2][0]-m[0][0]*m[2][1])*invD, (m[0][0]*m[1][1]-m[0][1]*m[1][0])*invD]
    ];
  }
  function matMul3(A, B) {
    const C = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i=0;i<3;i++) for (let j=0;j<3;j++) C[i][j] = A[i][0]*B[0][j] + A[i][1]*B[1][j] + A[i][2]*B[2][j];
    return C;
  }
  function matT3(A) {
    return [[A[0][0],A[1][0],A[2][0]],[A[0][1],A[1][1],A[2][1]],[A[0][2],A[1][2],A[2][2]]];
  }
  // Row-vector * Matrix: f * A
  function fracToCart(f, L) {
    return [
      f[0]*L[0][0] + f[1]*L[1][0] + f[2]*L[2][0],
      f[0]*L[0][1] + f[1]*L[1][1] + f[2]*L[2][1],
      f[0]*L[0][2] + f[1]*L[1][2] + f[2]*L[2][2]
    ];
  }
  function cartToFrac(c, L) {
    const inv = matInv3(L);
    if (!inv) return [0,0,0];
    return [
      c[0]*inv[0][0] + c[1]*inv[1][0] + c[2]*inv[2][0],
      c[0]*inv[0][1] + c[1]*inv[1][1] + c[2]*inv[2][1],
      c[0]*inv[0][2] + c[1]*inv[1][2] + c[2]*inv[2][2]
    ];
  }
  function getLatticeParams(L) {
    const a = vNorm(L[0]), b = vNorm(L[1]), c = vNorm(L[2]);
    const clamp = (x) => Math.max(-1, Math.min(1, x));
    const alpha = Math.acos(clamp(vDot(L[1],L[2])/(b*c || 1))) * 180 / Math.PI;
    const beta  = Math.acos(clamp(vDot(L[0],L[2])/(a*c || 1))) * 180 / Math.PI;
    const gamma = Math.acos(clamp(vDot(L[0],L[1])/(a*b || 1))) * 180 / Math.PI;
    const vol = Math.abs(vDot(L[0], vCross(L[1], L[2])));
    return { a, b, c, alpha, beta, gamma, vol };
  }
  function getReciprocalLattice(L) {
    const vol = vDot(L[0], vCross(L[1], L[2]));
    const f = (2 * Math.PI) / (Math.abs(vol) > 1e-12 ? vol : 1);
    return [
      vScale(vCross(L[1], L[2]), f),
      vScale(vCross(L[2], L[0]), f),
      vScale(vCross(L[0], L[1]), f)
    ];
  }
  function paramsToLattice(a, b, c, alphaDeg, betaDeg, gammaDeg) {
    const ar = alphaDeg*Math.PI/180, br = betaDeg*Math.PI/180, gr = gammaDeg*Math.PI/180;
    const ca = Math.cos(ar), cb = Math.cos(br), cg = Math.cos(gr), sg = Math.sin(gr);
    const ax = a, ay = 0, az = 0;
    const bx = b * cg, by = b * sg, bz = 0;
    const cx = c * cb;
    const cy = c * (ca - cb * cg) / (sg || 1);
    const cz = c * Math.sqrt(Math.max(0, 1 - cb*cb - Math.pow((ca - cb*cg)/(sg || 1), 2)));
    return [[ax,ay,az],[bx,by,bz],[cx,cy,cz]];
  }
  function pbcDist(f1, f2, L) {
    const df = [f1[0]-f2[0], f1[1]-f2[1], f1[2]-f2[2]];
    for (let k=0;k<3;k++) df[k] -= Math.round(df[k]);
    return vNorm(fracToCart(df, L));
  }

  // =========================================================================
  // 4. APPLICATION STATE
  // =========================================================================
  const state = {
    structure: null,
    history: [],
    tool: 'rotate',          // rotate, select, pan, zoom, distance, angle, dihedral
    styleMode: 'ballstick',  // ballstick, polyhedral, spacefill, stick, wireframe
    showUnitCell: true,
    showVectors: true,
    showLabels: false,
    showPolyEdges: true,
    isOrtho: true,
    atomScale: 0.42,
    bondRadius: 0.10,
    bondCutoff: 1.18,
    polyOpacity: 0.48,
    vecScale: 0.95,
    vecTiltDeg: 45,
    pendingAutoSC: null,
    magUpColor: '#e11d48',
    magDnColor: '#0284c7',
    magMode: 'collinear',    // collinear | noncollinear
    boundary: { xmin:-0.05, xmax:1.05, ymin:-0.05, ymax:1.05, zmin:-0.05, zmax:1.05 },
    speciesConfig: {},       // { El: { color, visible, polyCenter } }
    selectedAtomIndices: [], // indices into structure.atoms
    measureQueue: [],        // displayed atom objects clicked during measurement
    measurements: [],        // { type, pts, label }
    symmetryResult: null,
    activeVaspFile: 'POSCAR',
    kptsMode: 'Gamma',
    kptsSpacing: 0.04,
    kptsNseg: 25,
    poscarCoord: 'Direct',
    incarPreset: 'scf',
    incarEncut: 520,
    incarLdau: false,
    dark: false
  };

  function cloneStructure(s) {
    return {
      name: s.name,
      cifSG: s.cifSG || null,
      lattice: s.lattice.map(r => [...r]),
      selectiveDynamics: !!s.selectiveDynamics,
      polyCenters: [...(s.polyCenters || [])],
      atoms: s.atoms.map(a => ({
        el: a.el,
        frac: [...a.frac],
        mag: [...(a.mag || [0,0,0])],
        sel: [...(a.sel || [true,true,true])]
      }))
    };
  }

  function pushHistory() {
    if (!state.structure) return;
    state.history.push(cloneStructure(state.structure));
    if (state.history.length > 100) state.history.shift();
    state.future = [];
    syncHistoryButtons();
  }
  // Undo and redo stacks (redo added when Studio replaced the site's Material Builder, D-100).
  function syncHistoryButtons() {
    document.getElementById('btn-undo').disabled = state.history.length === 0;
    const r = document.getElementById('btn-redo');
    if (r) r.disabled = !state.future || state.future.length === 0;
  }
  function undoStep() {
    if (state.history.length === 0) return false;
    if (!state.future) state.future = [];
    state.future.push(cloneStructure(state.structure));
    state.structure = state.history.pop();
    syncHistoryButtons();
    state.selectedAtomIndices = [];
    refreshAllUI(true);
    showToast('Undid last change');
    return true;
  }
  function redoStep() {
    if (!state.future || state.future.length === 0) return false;
    state.history.push(cloneStructure(state.structure));
    state.structure = state.future.pop();
    syncHistoryButtons();
    state.selectedAtomIndices = [];
    refreshAllUI(true);
    showToast('Redid change');
    return true;
  }

  // =========================================================================
  // 5. FILE PARSERS (POSCAR/CONTCAR, CIF, XYZ) & EXPORTERS
  // =========================================================================
  function parsePOSCAR(text, fallbackName) {
    const rawLines = text.replace(/\r/g,'').split('\n').map(l => l.trim());
    const lines = rawLines.filter((l, i) => i === 0 || l.length > 0);
    if (lines.length < 8) throw new Error('POSCAR too short');
    const name = lines[0] || fallbackName || 'Imported POSCAR';
    const scale = parseFloat(lines[1]);
    if (isNaN(scale)) throw new Error('Invalid POSCAR scale factor');
    let L = [2,3,4].map(i => lines[i].split(/\s+/).slice(0,3).map(Number));
    if (scale < 0) {
      const vol = Math.abs(matDet3(L));
      const f = Math.cbrt(Math.abs(scale) / (vol || 1));
      L = L.map(r => r.map(x => x * f));
    } else {
      L = L.map(r => r.map(x => x * scale));
    }
    let idx = 5;
    let species = [];
    let counts = [];
    const tokens5 = lines[idx].split(/\s+/);
    const cleanElToken = (tok) => {
      const base = String(tok || '').trim().split(/[\/_.-]/)[0];
      const m = base.match(/^([A-Za-z]{1,2})/);
      if (!m) return 'X';
      return m[1][0].toUpperCase() + (m[1][1] ? m[1][1].toLowerCase() : '');
    };
    if (isNaN(Number(tokens5[0]))) {
      species = tokens5.map(cleanElToken);
      idx++;
      counts = lines[idx].split(/\s+/).map(Number);
      idx++;
    } else {
      counts = tokens5.map(Number);
      species = counts.map((_, i) => ['Fe','O','Si','Ni','Ti','C'][i % 6]);
      idx++;
    }
    let selDyn = false;
    if (/^[sS]/.test(lines[idx])) { selDyn = true; idx++; }
    const isCart = /^[cCkK]/.test(lines[idx]);
    idx++;
    const atoms = [];
    let total = counts.reduce((a,b) => a+b, 0);
    let spIdx = 0, spCount = 0;
    for (let i=0; i<total && idx < lines.length; i++, idx++) {
      while (spCount >= counts[spIdx] && spIdx < counts.length - 1) { spIdx++; spCount = 0; }
      const parts = lines[idx].split(/\s+/);
      let coord = [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])];
      let frac = isCart ? cartToFrac(scale > 0 ? vScale(coord, scale) : coord, L) : coord;
      frac = frac.map(wrap01);
      let sel = [true, true, true];
      if (selDyn && parts.length >= 6) {
        sel = [parts[3].toUpperCase().startsWith('T'), parts[4].toUpperCase().startsWith('T'), parts[5].toUpperCase().startsWith('T')];
      }
      atoms.push({ el: species[spIdx], frac, mag:[0,0,0], sel });
      spCount++;
    }
    return { name, cifSG: null, lattice: L, selectiveDynamics: selDyn, polyCenters: [], atoms };
  }

  function parseXYZ(text, fallbackName) {
    const lines = text.replace(/\r/g,'').split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const n = parseInt(lines[0], 10);
    if (isNaN(n) || lines.length < n + 2) throw new Error('Invalid XYZ format');
    const comment = lines[1];
    let L = null;
    const latMatch = comment.match(/Lattice="([^"]+)"/i);
    if (latMatch) {
      const nums = latMatch[1].trim().split(/\s+/).map(Number);
      if (nums.length >= 9) L = [nums.slice(0,3), nums.slice(3,6), nums.slice(6,9)];
    }
    const rawAtoms = [];
    for (let i=0; i<n; i++) {
      const p = lines[i+2].split(/\s+/);
      rawAtoms.push({ el: p[0], cart: [parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])] });
    }
    if (!L) {
      let min=[1e9,1e9,1e9], max=[-1e9,-1e9,-1e9];
      rawAtoms.forEach(a => { for(let k=0;k<3;k++){ min[k]=Math.min(min[k],a.cart[k]); max[k]=Math.max(max[k],a.cart[k]); } });
      const pad = 8.0;
      L = [[Math.max(10, max[0]-min[0]+pad),0,0],[0,Math.max(10, max[1]-min[1]+pad),0],[0,0,Math.max(10, max[2]-min[2]+pad)]];
      const shift = [-(min[0]-pad/2), -(min[1]-pad/2), -(min[2]-pad/2)];
      rawAtoms.forEach(a => a.cart = vAdd(a.cart, shift));
    }
    const atoms = rawAtoms.map(a => ({ el: a.el, frac: cartToFrac(a.cart, L).map(wrap01), mag:[0,0,0], sel:[true,true,true] }));
    return { name: fallbackName || 'Imported XYZ', cifSG: null, lattice: L, selectiveDynamics: false, polyCenters: [], atoms };
  }

  function parseCIF(text, fallbackName) {
    const cleanNum = (s) => parseFloat(String(s).replace(/\([^)]*\)/g, ''));
    const getVal = (tag) => {
      const m = text.match(new RegExp(tag + '\\s+([^\\n#]+)', 'i'));
      return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null;
    };
    const a = cleanNum(getVal('_cell_length_a'));
    const b = cleanNum(getVal('_cell_length_b'));
    const c = cleanNum(getVal('_cell_length_c'));
    const al = cleanNum(getVal('_cell_angle_alpha')) || 90;
    const be = cleanNum(getVal('_cell_angle_beta')) || 90;
    const ga = cleanNum(getVal('_cell_angle_gamma')) || 90;
    if (isNaN(a) || isNaN(b) || isNaN(c)) throw new Error('Missing CIF cell parameters');
    const L = paramsToLattice(a, b, c, al, be, ga);
    const sgName = getVal('_space_group_name_H-M_alt') || getVal('_symmetry_space_group_name_H-M') || null;

    // Parse loops for symmetry ops and atom sites
    const lines = text.replace(/\r/g,'').split('\n');
    const symOps = [];
    const baseAtoms = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line === 'loop_') {
        i++;
        const cols = [];
        while (i < lines.length && lines[i].trim().startsWith('_')) {
          cols.push(lines[i].trim().toLowerCase());
          i++;
        }
        const rows = [];
        while (i < lines.length) {
          const r = lines[i].trim();
          if (!r || r.startsWith('#')) { i++; continue; }
          if (r === 'loop_' || r.startsWith('_') || r.startsWith('data_')) break;
          rows.push(r);
          i++;
        }
        const symCol = cols.findIndex(c => c.includes('symop_operation_xyz') || c.includes('equiv_pos_as_xyz'));
        if (symCol >= 0) {
          rows.forEach(r => {
            const m = r.match(/['"]([^'"]+)['"]/);
            const expr = m ? m[1] : r.split(/\s+/)[symCol];
            if (expr && expr.includes(',')) symOps.push(expr);
          });
        }
        const xCol = cols.indexOf('_atom_site_fract_x');
        const yCol = cols.indexOf('_atom_site_fract_y');
        const zCol = cols.indexOf('_atom_site_fract_z');
        if (xCol >= 0 && yCol >= 0 && zCol >= 0) {
          const symTypeCol = cols.indexOf('_atom_site_type_symbol');
          const lblCol = cols.indexOf('_atom_site_label');
          rows.forEach(r => {
            const toks = r.match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/g) || [];
            if (toks.length <= Math.max(xCol, yCol, zCol)) return;
            const rawEl = (symTypeCol >= 0 ? toks[symTypeCol] : (lblCol >= 0 ? toks[lblCol] : 'X')).replace(/['"]/g,'');
            const elMatch = rawEl.match(/^([A-Z][a-z]?)/);
            const el = elMatch ? elMatch[1] : 'X';
            const fx = cleanNum(toks[xCol]), fy = cleanNum(toks[yCol]), fz = cleanNum(toks[zCol]);
            if (!isNaN(fx) && !isNaN(fy) && !isNaN(fz)) baseAtoms.push({ el, frac:[wrap01(fx), wrap01(fy), wrap01(fz)] });
          });
        }
      } else {
        i++;
      }
    }
    if (baseAtoms.length === 0) throw new Error('No _atom_site_fract_* found in CIF');

    // Expand symmetry operations safely
    function evalSymExpr(expr, x, y, z) {
      return expr.split(',').map(part => {
        const s = part.replace(/\s+/g,'').toLowerCase();
        let val = 0;
        const terms = s.match(/[+-]?[^+-]+/g) || [];
        for (const t of terms) {
          if (t.includes('x')) val += (t.startsWith('-') ? -1 : 1) * x;
          else if (t.includes('y')) val += (t.startsWith('-') ? -1 : 1) * y;
          else if (t.includes('z')) val += (t.startsWith('-') ? -1 : 1) * z;
          else if (t.includes('/')) { const [n,d] = t.split('/').map(Number); val += n/(d||1); }
          else val += parseFloat(t) || 0;
        }
        return wrap01(val);
      });
    }

    const atoms = [];
    const ops = symOps.length > 0 ? symOps : ['x,y,z'];
    for (const ba of baseAtoms) {
      for (const op of ops) {
        const f = evalSymExpr(op, ba.frac[0], ba.frac[1], ba.frac[2]);
        const dup = atoms.some(a => pbcDist(a.frac, f, L) < 0.08);
        if (!dup) atoms.push({ el: ba.el, frac: f, mag:[0,0,0], sel:[true,true,true] });
      }
    }
    return { name: fallbackName || 'Imported CIF', cifSG: sgName, lattice: L, selectiveDynamics: false, polyCenters: [], atoms };
  }

  function autoParseStructure(text, fileName) {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.cif') || text.includes('_cell_length_a')) return parseCIF(text, fileName);
    if (lower.endsWith('.xyz')) return parseXYZ(text, fileName);
    // Check if first line is integer atom count (XYZ)
    const firstLine = text.trim().split('\n')[0].trim();
    if (/^\d+$/.test(firstLine) && text.trim().split('\n').length >= parseInt(firstLine,10) + 2) {
      const l2 = text.trim().split('\n')[2] || '';
      if (/^[A-Za-z]{1,2}\s+[-+]?\d/.test(l2.trim())) return parseXYZ(text, fileName);
    }
    return parsePOSCAR(text, fileName);
  }

  // POSCAR site i is atoms[poscarOrder(atoms)[i]] (POSCAR groups the sites by species).
  function poscarOrder(atoms) {
    return Array.from(getSpeciesOrder(atoms).values()).flat().map(a => a.origIdx);
  }

  // Group atoms by element preserving order
  function getSpeciesOrder(atoms) {
    const map = new Map();
    atoms.forEach((a, idx) => {
      if (!map.has(a.el)) map.set(a.el, []);
      map.get(a.el).push({ ...a, origIdx: idx });
    });
    return map;
  }

  function generatePOSCAR() {
    const s = state.structure;
    if (!s) return '';
    const spMap = getSpeciesOrder(s.atoms);
    const species = Array.from(spMap.keys());
    const counts = species.map(k => spMap.get(k).length);
    const fmt = (n) => (n >= 0 ? ' ' : '') + n.toFixed(9);
    const lines = [
      s.name || 'VESTA-Web VASP Structure',
      '1.000000000',
      ...s.lattice.map(r => '  ' + r.map(fmt).join('  ')),
      '  ' + species.join('  '),
      '  ' + counts.join('  ')
    ];
    if (s.selectiveDynamics) lines.push('Selective dynamics');
    lines.push(state.poscarCoord);
    for (const el of species) {
      for (const a of spMap.get(el)) {
        const c = state.poscarCoord === 'Cartesian' ? fracToCart(a.frac, s.lattice) : a.frac;
        let row = '  ' + c.map(fmt).join('  ');
        if (s.selectiveDynamics) {
          row += '  ' + a.sel.map(b => b ? 'T' : 'F').join(' ');
        }
        lines.push(row);
      }
    }
    return lines.join('\n') + '\n';
  }

  function generateCIF() {
    const s = state.structure;
    const p = getLatticeParams(s.lattice);
    const lines = [
      'data_vesta_web_vasp',
      `_cell_length_a   ${p.a.toFixed(6)}`,
      `_cell_length_b   ${p.b.toFixed(6)}`,
      `_cell_length_c   ${p.c.toFixed(6)}`,
      `_cell_angle_alpha ${p.alpha.toFixed(4)}`,
      `_cell_angle_beta  ${p.beta.toFixed(4)}`,
      `_cell_angle_gamma ${p.gamma.toFixed(4)}`,
      `_space_group_name_H-M_alt '${s.cifSG || 'P 1'}'`,
      'loop_',
      '_atom_site_label',
      '_atom_site_type_symbol',
      '_atom_site_fract_x',
      '_atom_site_fract_y',
      '_atom_site_fract_z'
    ];
    s.atoms.forEach((a, i) => {
      lines.push(`${a.el}${i+1} ${a.el} ${a.frac[0].toFixed(6)} ${a.frac[1].toFixed(6)} ${a.frac[2].toFixed(6)}`);
    });
    return lines.join('\n') + '\n';
  }

  function fmtMagNum(x) {
    if (Math.abs(x) < 1e-4) return '0.0';
    return Math.abs(x - Math.round(x)) < 1e-3 ? String(Math.round(x)) : x.toFixed(2);
  }

  function generateMAGMOMString() {
    const s = state.structure;
    if (!s || s.atoms.length === 0) return '';
    const spMap = getSpeciesOrder(s.atoms);
    const blocks = [];

    for (const list of spMap.values()) {
      if (state.magMode === 'noncollinear') {
        blocks.push(list.map(a => `${fmtMagNum(a.mag[0])} ${fmtMagNum(a.mag[1])} ${fmtMagNum(a.mag[2])}`).join('  '));
      } else {
        const vals = list.map(a => Number(a.mag[2].toFixed(3)));
        const allZero = vals.every(v => Math.abs(v) < 1e-4);
        if (allZero) {
          blocks.push(vals.length > 1 ? `${vals.length}*0.0` : '0.0');
        } else if (vals.length <= 8) {
          // Explicit per-atom order for small magnetic sublattices (matches VASP INCAR.scf style!)
          blocks.push(vals.map(fmtMagNum).join(' '));
        } else {
          // Run-length compressed for large supercells
          const runs = [];
          let cur = vals[0], cnt = 1;
          for (let i=1; i<vals.length; i++) {
            if (Math.abs(vals[i] - cur) < 1e-4) cnt++;
            else { runs.push(cnt > 1 ? `${cnt}*${fmtMagNum(cur)}` : fmtMagNum(cur)); cur = vals[i]; cnt = 1; }
          }
          runs.push(cnt > 1 ? `${cnt}*${fmtMagNum(cur)}` : fmtMagNum(cur));
          blocks.push(runs.join(' '));
        }
      }
    }
    return 'MAGMOM = ' + blocks.join('   ');
  }

  function computeAutoKMesh() {
    const B = getReciprocalLattice(state.structure.lattice);
    const dk = Math.max(0.005, state.kptsSpacing) * 2 * Math.PI;
    return B.map(b => Math.max(1, Math.round(vNorm(b) / dk)));
  }

  function generateKPOINTS() {
    if (state.kptsMode === 'Line-mode') {
      const kkey = state.symmetryResult ? state.symmetryResult.kpathKey : 'Cubic-P';
      const kp = KPATHS[kkey] || KPATHS['Cubic-P'];
      const lines = [
        `High-symmetry k-path (${kkey})`,
        `${state.kptsNseg}`,
        'Line-mode',
        'Reciprocal'
      ];
      kp.segments.forEach(([a, b]) => {
        const pa = kp.pts[a], pb = kp.pts[b];
        const la = a === 'G' ? 'Gamma' : a;
        const lb = b === 'G' ? 'Gamma' : b;
        lines.push(`  ${pa[0].toFixed(5)}  ${pa[1].toFixed(5)}  ${pa[2].toFixed(5)}  ! ${la}`);
        lines.push(`  ${pb[0].toFixed(5)}  ${pb[1].toFixed(5)}  ${pb[2].toFixed(5)}  ! ${lb}`);
        lines.push('');
      });
      return lines.join('\n');
    } else {
      const [kx, ky, kz] = computeAutoKMesh();
      const kb = document.getElementById('kpts-grid-badge'); if (kb) kb.textContent = `${kx}×${ky}×${kz}`;
      return [
        `Automatic mesh (k-spacing = ${state.kptsSpacing} 2pi/A)`,
        '0',
        state.kptsMode,
        `  ${kx}  ${ky}  ${kz}`,
        '  0  0  0'
      ].join('\n') + '\n';
    }
  }

  function generateINCAR() {
    const s = state.structure;
    const hasMag = s.atoms.some(a => vNorm(a.mag) > 1e-3);
    const magLine = generateMAGMOMString();
    const lines = [
      `SYSTEM = ${s.name}`,
      'PREC   = Accurate',
      `ENCUT  = ${state.incarEncut}`,
      'EDIFF  = 1E-8',
      'NELM   = 150',
      'ALGO   = Normal',
      'LREAL  = .FALSE.',
      'ADDGRID = .TRUE.',
      'LWAVE  = .FALSE.',
      'LCHARG = .TRUE.'
    ];
    if (state.incarPreset === 'relax') {
      lines.push('', '# Ionic & Cell Relaxation', 'IBRION = 2', 'ISIF   = 3', 'NSW    = 100', 'EDIFFG = -0.01', 'ISMEAR = 0', 'SIGMA  = 0.05');
    } else if (state.incarPreset === 'dos') {
      lines.push('', '# Density of States', 'ICHARG = 11', 'ISMEAR = -5', 'LORBIT = 11', 'NEDOS  = 2001');
    } else if (state.incarPreset === 'bands') {
      lines.push('', '# Band Structure (Line-Mode KPOINTS)', 'ICHARG = 11', 'ISMEAR = 0', 'SIGMA  = 0.05', 'LORBIT = 11');
    } else if (state.incarPreset === 'soc') {
      lines.push('', '# Spin-Orbit Coupling + Non-Collinear Magnetism', 'ISMEAR = 0', 'SIGMA  = 0.05', 'LSORBIT = .TRUE.', 'LNONCOLLINEAR = .TRUE.', 'SAXIS  = 0 0 1', 'ISYM   = 0', 'LORBIT = 11');
    } else {
      lines.push('', '# Static SCF', 'ISMEAR = 0', 'SIGMA  = 0.05', 'LORBIT = 11');
    }

    if (state.incarPreset !== 'soc') {
      if (state.magMode === 'noncollinear') {
        lines.push('', '# Non-Collinear Magnetism', 'LNONCOLLINEAR = .TRUE.', 'ISYM   = 0', magLine);
      } else if (hasMag) {
        lines.push('', '# Collinear Spin Polarization', 'ISPIN  = 2', magLine);
      } else {
        lines.push('', '# Non-Spin-Polarized', 'ISPIN  = 1');
      }
    } else {
      lines.push(magLine);
    }

    if (state.incarLdau) {
      const spList = Array.from(getSpeciesOrder(s.atoms).keys());
      const ldauL = spList.map(el => getElInfo(el).is3d ? 2 : -1).join(' ');
      const ldauU = spList.map(el => getElInfo(el).is3d ? (getElInfo(el).defU || 4.0).toFixed(1) : '0.0').join(' ');
      const ldauJ = spList.map(() => '0.0').join(' ');
      lines.push(
        '',
        '# DFT+U (Dudarev)',
        'LDAU      = .TRUE.',
        'LDAUTYPE  = 2',
        `LDAUL     = ${ldauL}   # ${spList.join(' ')}`,
        `LDAUU     = ${ldauU}`,
        `LDAUJ     = ${ldauJ}`,
        'LMAXMIX   = 4'
      );
    }
    return lines.join('\n') + '\n';
  }

  // =========================================================================
  // 6. CLIENT-SIDE SYMMETRY & SPACE GROUP ANALYZER
  // =========================================================================
  function analyzeSymmetry(tol = 0.02) {
    const s = state.structure;
    const L = s.lattice;
    const G = matMul3(L, matT3(L)); // metric tensor
    const latTol = Math.max(0.05, tol * 3);

    // 1. Find all integer unimodular matrices R with entries in {-1,0,1} preserving metric G
    const colCands = [[],[],[]];
    for (let k=0; k<3; k++) {
      const targetLen = G[k][k];
      for (let a=-1; a<=1; a++) for (let b=-1; b<=1; b++) for (let c=-1; c<=1; c++) {
        if (a===0 && b===0 && c===0) continue;
        const v = [a,b,c];
        // v * G * v^T
        let len2 = 0;
        for (let i=0;i<3;i++) for (let j=0;j<3;j++) len2 += v[i]*G[i][j]*v[j];
        if (Math.abs(len2 - targetLen) <= latTol * Math.sqrt(targetLen) + 0.02) {
          colCands[k].push(v);
        }
      }
    }
    const latOps = [];
    for (const r0 of colCands[0]) {
      for (const r1 of colCands[1]) {
        let g01 = 0;
        for (let i=0;i<3;i++) for (let j=0;j<3;j++) g01 += r0[i]*G[i][j]*r1[j];
        if (Math.abs(g01 - G[0][1]) > latTol * Math.sqrt(G[0][0]*G[1][1]) + 0.02) continue;
        for (const r2 of colCands[2]) {
          const R = [r0, r1, r2];
          const det = matDet3(R);
          if (Math.abs(det) !== 1) continue;
          let g02 = 0, g12 = 0;
          for (let i=0;i<3;i++) for (let j=0;j<3;j++) {
            g02 += r0[i]*G[i][j]*r2[j];
            g12 += r1[i]*G[i][j]*r2[j];
          }
          if (Math.abs(g02 - G[0][2]) > latTol * Math.sqrt(G[0][0]*G[2][2]) + 0.02) continue;
          if (Math.abs(g12 - G[1][2]) > latTol * Math.sqrt(G[1][1]*G[2][2]) + 0.02) continue;
          latOps.push(R);
        }
      }
    }

    // 2. Test translations for each lattice rotation R
    const spMap = getSpeciesOrder(s.atoms);
    let minSp = null, minList = null;
    for (const [el, list] of spMap.entries()) {
      if (!minList || list.length < minList.length) { minSp = el; minList = list; }
    }
    const refAtom = minList[0];
    const verifiedOps = [];
    const rotMulVec = (R, f) => [
      R[0][0]*f[0] + R[1][0]*f[1] + R[2][0]*f[2],
      R[0][1]*f[0] + R[1][1]*f[1] + R[2][1]*f[2],
      R[0][2]*f[0] + R[1][2]*f[1] + R[2][2]*f[2]
    ];

    for (const R of latOps) {
      const rf0 = rotMulVec(R, refAtom.frac);
      for (const cand of minList) {
        const t = [wrap01(cand.frac[0] - rf0[0]), wrap01(cand.frac[1] - rf0[1]), wrap01(cand.frac[2] - rf0[2])];
        let allMatch = true;
        for (let i=0; i<s.atoms.length; i++) {
          const ai = s.atoms[i];
          const rf = rotMulVec(R, ai.frac);
          const mapped = [wrap01(rf[0]+t[0]), wrap01(rf[1]+t[1]), wrap01(rf[2]+t[2])];
          let found = false;
          for (let j=0; j<s.atoms.length; j++) {
            if (s.atoms[j].el === ai.el && pbcDist(mapped, s.atoms[j].frac, L) <= tol) { found = true; break; }
          }
          if (!found) { allMatch = false; break; }
        }
        if (allMatch) {
          verifiedOps.push({ R, t });
        }
      }
    }

    // 3. Extract point group, inversion, centering, and crystal system
    const uniqueRKey = new Set();
    const pgOps = [];
    let hasInversion = false;
    let pureTranslations = [];
    for (const op of verifiedOps) {
      const key = op.R.flat().join(',');
      if (!uniqueRKey.has(key)) { uniqueRKey.add(key); pgOps.push(op.R); }
      if (key === '-1,0,0,0,-1,0,0,0,-1') hasInversion = true;
      if (key === '1,0,0,0,1,0,0,0,1') pureTranslations.push(op.t);
    }

    // Rotation order analysis on pgOps
    const orders = { 1:0, 2:0, 3:0, 4:0, 6:0, '-1':0, '-2':0, '-3':0, '-4':0, '-6':0 };
    for (const R of pgOps) {
      const det = matDet3(R);
      const tr = R[0][0] + R[1][1] + R[2][2];
      const properTr = det * tr;
      let ord = 1;
      if (properTr === 3) ord = 1;
      else if (properTr === -1) ord = 2;
      else if (properTr === 0) ord = 3;
      else if (properTr === 1) ord = 4;
      else if (properTr === 2) ord = 6;
      const k = det > 0 ? String(ord) : String(-ord);
      if (orders[k] !== undefined) orders[k]++;
    }

    let system = 'Triclinic', pg = hasInversion ? '-1' : '1';
    const n3 = orders['3'] + orders['-3'];
    const n4 = orders['4'] + orders['-4'];
    const n6 = orders['6'] + orders['-6'];
    const n2 = orders['2'] + orders['-2'];
    if (n3 >= 8) {
      system = 'Cubic';
      if (pgOps.length === 48) pg = 'm-3m';
      else if (pgOps.length === 24) pg = hasInversion ? 'm-3' : (n4 > 0 ? '432' : '-43m');
      else pg = '23';
    } else if (n6 > 0) {
      system = 'Hexagonal';
      if (pgOps.length === 24) pg = '6/mmm';
      else if (pgOps.length === 12) pg = hasInversion ? '6/m' : (orders['-6'] > 0 ? '-6m2' : (orders['-2'] > 0 ? '6mm' : '622'));
      else pg = orders['-6'] > 0 ? '-6' : '6';
    } else if (n4 > 0) {
      system = 'Tetragonal';
      if (pgOps.length === 16) pg = '4/mmm';
      else if (pgOps.length === 8) pg = hasInversion ? '4/m' : (orders['-4'] > 0 ? '-42m' : (orders['-2'] > 0 ? '4mm' : '422'));
      else pg = orders['-4'] > 0 ? '-4' : '4';
    } else if (n3 > 0) {
      system = 'Trigonal';
      if (pgOps.length === 12) pg = '-3m';
      else if (pgOps.length === 6) pg = hasInversion ? '-3' : (orders['-2'] > 0 ? '3m' : '32');
      else pg = '3';
    } else if (n2 >= 3) {
      system = 'Orthorhombic';
      if (pgOps.length === 8) pg = 'mmm';
      else pg = orders['-2'] > 0 ? 'mm2' : '222';
    } else if (n2 >= 1) {
      system = 'Monoclinic';
      if (pgOps.length === 4) pg = '2/m';
      else pg = orders['-2'] > 0 ? 'm' : '2';
    }

    // Bravais centering detection
    let centering = 'P';
    if (pureTranslations.length === 4) centering = 'F';
    else if (pureTranslations.length === 3) centering = 'R';
    else if (pureTranslations.length === 2) {
      const t = pureTranslations.find(v => vNorm(v) > 0.1) || [0,0,0];
      const nearHalf = (x) => Math.abs(x - 0.5) < 0.08;
      if (nearHalf(t[0]) && nearHalf(t[1]) && nearHalf(t[2])) centering = 'I';
      else if (nearHalf(t[0]) && nearHalf(t[1])) centering = 'C';
      else if (nearHalf(t[1]) && nearHalf(t[2])) centering = 'A';
      else centering = 'B';
    }

    // Equivalent atom orbits (Wyckoff-like grouping)
    const visited = new Array(s.atoms.length).fill(false);
    const orbits = [];
    for (let i=0; i<s.atoms.length; i++) {
      if (visited[i]) continue;
      const members = new Set([i]);
      const ai = s.atoms[i];
      for (const op of verifiedOps) {
        const rf = rotMulVec(op.R, ai.frac);
        const mapped = [wrap01(rf[0]+op.t[0]), wrap01(rf[1]+op.t[1]), wrap01(rf[2]+op.t[2])];
        for (let j=0; j<s.atoms.length; j++) {
          if (s.atoms[j].el === ai.el && pbcDist(mapped, s.atoms[j].frac, L) <= tol) {
            members.add(j);
          }
        }
      }
      members.forEach(idx => visited[idx] = true);
      orbits.push({ el: ai.el, mult: members.size, repIdx: i, repFrac: ai.frac, indices: Array.from(members) });
    }

    // k-path key
    let kpathKey = system;
    if (system === 'Cubic') kpathKey = centering === 'F' ? 'Cubic-F' : (centering === 'I' ? 'Cubic-I' : 'Cubic-P');
    else if (system === 'Trigonal') kpathKey = 'Hexagonal';

    // Detect nonsymmorphic screw/glide & map to International Tables Space Group (#1-230)
    const isFracShift = (v) => v.some(c => {
      const m = wrap01(c);
      return m > 0.05 && m < 0.95;
    });
    const hasQuarter = verifiedOps.some(op => op.t.some(c => Math.abs(wrap01(c) - 0.25) < 0.04 || Math.abs(wrap01(c) - 0.75) < 0.04));
    const hasHalfZ = verifiedOps.some(op => {
      const key = op.R.flat().join(',');
      return key !== '1,0,0,0,1,0,0,0,1' && Math.abs(wrap01(op.t[2]) - 0.5) < 0.04;
    });
    const hasNonSymm = verifiedOps.some(op => {
      const key = op.R.flat().join(',');
      if (key === '1,0,0,0,1,0,0,0,1') return false;
      // Check if t differs from every pure lattice translation
      return !pureTranslations.some(pt => Math.hypot(wrap01(op.t[0]-pt[0]), wrap01(op.t[1]-pt[1]), wrap01(op.t[2]-pt[2])) < 0.06);
    });

    const SG_TABLE = {
      'P|1': 'P1 (#1)', 'P|-1': 'P-1 (#2)',
      'P|2': 'P2 (#3)', 'C|2': 'C2 (#5)', 'P|m': 'Pm (#6)', 'C|m': 'Cm (#8)',
      'P|2/m': 'P2/m (#10)', 'C|2/m': 'C2/m (#12)',
      'P|222': 'P222 (#16)', 'C|222': 'C222 (#21)', 'F|222': 'F222 (#22)', 'I|222': 'I222 (#23)',
      'P|mm2': 'Pmm2 (#25)', 'C|mm2': 'Cmm2 (#35)', 'F|mm2': 'Fmm2 (#42)', 'I|mm2': 'Imm2 (#44)',
      'P|mmm': 'Pmmm (#47)', 'C|mmm': 'Cmmm (#65)', 'F|mmm': 'Fmmm (#69)', 'I|mmm': 'Immm (#71)',
      'P|4': 'P4 (#75)', 'I|4': 'I4 (#79)', 'P|-4': 'P-4 (#81)', 'I|-4': 'I-4 (#82)',
      'P|4/m': 'P4/m (#83)', 'I|4/m': 'I4/m (#87)', 'P|422': 'P422 (#89)', 'I|422': 'I422 (#97)',
      'P|4mm': 'P4mm (#99)', 'I|4mm': 'I4mm (#107)', 'P|-42m': 'P-42m (#111)', 'I|-42m': 'I-42m (#121)',
      'P|4/mmm': 'P4/mmm (#123)', 'I|4/mmm': 'I4/mmm (#139)',
      'P|3': 'P3 (#143)', 'R|3': 'R3 (#146)', 'P|-3': 'P-3 (#147)', 'R|-3': 'R-3 (#148)',
      'P|32': 'P321 (#150)', 'R|32': 'R32 (#155)', 'P|3m': 'P3m1 (#156)', 'R|3m': 'R3m (#160)',
      'P|-3m': 'P-3m1 (#164)', 'R|-3m': 'R-3m (#166)',
      'P|6': 'P6 (#168)', 'P|-6': 'P-6 (#174)', 'P|6/m': 'P6/m (#175)', 'P|622': 'P622 (#177)',
      'P|6mm': 'P6mm (#183)', 'P|-6m2': 'P-6m2 (#187)', 'P|6/mmm': 'P6/mmm (#191)',
      'P|23': 'P23 (#195)', 'F|23': 'F23 (#196)', 'I|23': 'I23 (#197)',
      'P|m-3': 'Pm-3 (#200)', 'F|m-3': 'Fm-3 (#202)', 'I|m-3': 'Im-3 (#204)',
      'P|432': 'P432 (#207)', 'F|432': 'F432 (#209)', 'I|432': 'I432 (#211)',
      'P|-43m': 'P-43m (#215)', 'F|-43m': 'F-43m (#216)', 'I|-43m': 'I-43m (#217)',
      'P|m-3m': 'Pm-3m (#221)', 'F|m-3m': 'Fm-3m (#225)', 'I|m-3m': 'Im-3m (#229)'
    };

    let autoSG = SG_TABLE[`${centering}|${pg}`] || `${centering}${pg}`;
    // Classify nonsymmorphic glide/screw signatures accurately (e.g. Pna2_1 #33 vs Pnma #62)
    const hasHalf = (x) => Math.abs(wrap01(x) - 0.5) < 0.05;
    if (hasNonSymm) {
      if (centering === 'F' && pg === 'm-3m' && hasQuarter) autoSG = 'Fd-3m (#227)';
      else if (centering === 'I' && pg === '4/mmm' && hasQuarter) autoSG = 'I4_1/amd (#141)';
      else if (centering === 'P' && pg === '6/mmm' && hasHalfZ) autoSG = 'P6_3/mmc (#194)';
      else if (centering === 'R' && pg === '-3m' && hasHalfZ) autoSG = 'R-3c (#167)';
      else if (centering === 'P' && pg === 'mm2') {
        // Inspect the 2-fold rotation axis and the two mirror/glide planes
        const rot2 = verifiedOps.find(op => matDet3(op.R) === 1 && (op.R[0][0]+op.R[1][1]+op.R[2][2]) === -1);
        const mirrors = verifiedOps.filter(op => matDet3(op.R) === -1 && (op.R[0][0]+op.R[1][1]+op.R[2][2]) === 1);
        const polarAxis = rot2 ? [0,1,2].find(k => rot2.R[k][k] === 1) : 2;
        const isScrew21 = rot2 && polarAxis !== undefined && hasHalf(rot2.t[polarAxis]);
        // Count how many axes have 0.5 glide shifts in the two mirror planes
        const glideTypes = mirrors.map(m => {
          const normAx = [0,1,2].find(k => m.R[k][k] === -1);
          const inPlaneAxes = [0,1,2].filter(k => k !== normAx);
          const shifted = inPlaneAxes.filter(k => hasHalf(m.t[k]));
          if (shifted.length === 2) return 'n';
          if (shifted.length === 1) return ['a','b','c'][shifted[0]];
          return 'm';
        });
        const hasN = glideTypes.includes('n');
        const hasAxialGlide = glideTypes.some(g => ['a','b','c'].includes(g));
        const hasPureM = glideTypes.includes('m');
        if (isScrew21 && hasN && hasAxialGlide) autoSG = 'Pna2₁ (#33)';
        else if (isScrew21 && hasN && hasPureM) autoSG = 'Pmn2₁ (#31)';
        else if (isScrew21 && glideTypes.filter(g => ['a','b','c'].includes(g)).length === 2) autoSG = 'Pca2₁ (#29)';
        else if (isScrew21 && hasPureM && hasAxialGlide) autoSG = 'Pmc2₁ (#26)';
        else if (!isScrew21 && hasAxialGlide) autoSG = 'Pba2 (#32)';
        else if (isScrew21) autoSG = 'Pna2₁ (#33)';
      } else if (centering === 'P' && pg === 'mmm') {
        const mirrors = verifiedOps.filter(op => matDet3(op.R) === -1 && (op.R[0][0]+op.R[1][1]+op.R[2][2]) === 1);
        const gTypes = mirrors.map(m => {
          const normAx = [0,1,2].find(k => m.R[k][k] === -1);
          const inPlane = [0,1,2].filter(k => k !== normAx);
          const shifted = inPlane.filter(k => hasHalf(m.t[k]));
          return shifted.length === 2 ? 'n' : (shifted.length === 1 ? 'g' : 'm');
        });
        if (gTypes.filter(g => g === 'g').length === 3) autoSG = 'Pbca (#61)';
        else if (gTypes.filter(g => g === 'n').length === 2) autoSG = 'Pnnm (#58)';
        else autoSG = 'Pnma (#62)';
      } else if (centering === 'P' && pg === '222') {
        autoSG = 'P2₁2₁2₁ (#19)';
      } else if (centering === 'C' && pg === 'mmm' && hasHalfZ) autoSG = 'Cmcm (#63)';
      else if (centering === 'P' && pg === '2/m') autoSG = 'P2₁/c (#14)';
      else if (centering === 'C' && pg === '2/m') autoSG = 'C2/c (#15)';
    }

    // Format symmetry operations in Jones faithful (x, y, z) notation
    const fmtFracNum = (v) => {
      const m = wrap01(v);
      const fracs = [[0,''],[1/6,'+1/6'],[1/4,'+1/4'],[1/3,'+1/3'],[1/2,'+1/2'],[2/3,'+2/3'],[3/4,'+3/4'],[5/6,'+5/6']];
      for (const [val, str] of fracs) if (Math.abs(m - val) < 0.03) return str;
      return '+' + m.toFixed(3);
    };
    const fmtOp = ({ R, t }) => {
      const vars = ['x','y','z'];
      return [0,1,2].map(col => {
        let expr = '';
        for (let row=0; row<3; row++) {
          const c = R[row][col];
          if (c === 1) expr += (expr ? '+' : '') + vars[row];
          else if (c === -1) expr += '-' + vars[row];
        }
        return (expr || '0') + fmtFracNum(t[col]);
      }).join(', ');
    };
    const jonesOps = verifiedOps.map(fmtOp);

    // Enrich orbits with site-symmetry order & Wyckoff letter
    orbits.forEach((o, idx) => {
      o.wyckoff = `${o.mult}× (${o.el}${idx + 1})`;
      o.siteSymOrder = Math.max(1, Math.round(verifiedOps.length / o.mult));
      o.repCart = fracToCart(o.repFrac, L);
    });

    const estSG = s.cifSG ? s.cifSG : autoSG;
    state.symmetryResult = {
      system, centering, pg, estSG, nOps: verifiedOps.length,
      nPg: pgOps.length, hasInversion, orbits, kpathKey, jonesOps
    };
    return state.symmetryResult;
  }

  // =========================================================================
  // 6B. RELAXED CONTCAR STRUCTURAL ANALYZER (Hoppe ECoN, Distortion, Bonds, XRD)
  // =========================================================================
  const ANION_SET = new Set(['O','S','Se','Te','F','Cl','Br','I','N','P','As','C','H']);

  function computeSiteECoN(atomIdx) {
    const s = state.structure;
    const L = s.lattice;
    const ai = s.atoms[atomIdx];
    const ri = getElInfo(ai.el).r;
    const isCenterAnion = ANION_SET.has(ai.el);
    const structHasAnions = s.atoms.some(a => ANION_SET.has(a.el));
    const structHasCations = s.atoms.some(a => !ANION_SET.has(a.el));

    const neighbors = [];
    for (let j=0; j<s.atoms.length; j++) {
      const aj = s.atoms[j];
      // In ionic/oxide/halide crystals, restrict cation ECoN/polyhedra to anion ligands (and vice versa), matching VESTA
      if (structHasAnions && structHasCations) {
        if (!isCenterAnion && !ANION_SET.has(aj.el)) continue;
        if (isCenterAnion && ANION_SET.has(aj.el)) continue;
      }
      const rSum = ri + getElInfo(aj.el).r;
      const maxCut = Math.max(3.6, rSum * 1.55);
      for (let ix=-1; ix<=1; ix++) for (let iy=-1; iy<=1; iy++) for (let iz=-1; iz<=1; iz++) {
        if (j === atomIdx && ix === 0 && iy === 0 && iz === 0) continue;
        const df = [aj.frac[0]-ai.frac[0]+ix, aj.frac[1]-ai.frac[1]+iy, aj.frac[2]-ai.frac[2]+iz];
        const dr = fracToCart(df, L);
        const d = vNorm(dr);
        if (d > 0.4 && d <= maxCut) {
          neighbors.push({ el: aj.el, d, dr, isBond: d <= rSum * Math.max(state.bondCutoff, 1.25) });
        }
      }
    }
    neighbors.sort((a,b) => a.d - b.d);
    if (neighbors.length === 0) return { econ: 0, cn: 0, lAvg: 0, lMin: 0, lMax: 0, distortion: 0, polyVol: 0, bonded: [] };

    // Hoppe (1979) iterative Effective Coordination Number (ECoN)
    let lAvg = neighbors[0].d;
    for (let iter=0; iter<30; iter++) {
      let num = 0, den = 0;
      for (const nb of neighbors) {
        const w = Math.exp(1 - Math.pow(nb.d / lAvg, 6));
        num += nb.d * w;
        den += w;
      }
      if (den > 1e-12) lAvg = num / den;
    }
    let econ = 0;
    const weightedBonded = [];
    for (const nb of neighbors) {
      const w = Math.exp(1 - Math.pow(nb.d / lAvg, 6));
      econ += w;
      if (w >= 0.05) weightedBonded.push(nb);
    }

    const bonded = weightedBonded.length > 0 ? weightedBonded : neighbors.filter(nb => nb.isBond);
    const refList = bonded.length > 0 ? bonded : neighbors.slice(0, Math.max(1, Math.round(econ)));
    const meanB = refList.reduce((acc, x) => acc + x.d, 0) / refList.length;
    const distortion = refList.reduce((acc, x) => acc + Math.abs(x.d - meanB), 0) / (refList.length * (meanB || 1));

    // Exact Polyhedral Volume via unique outward planes (avoids coplanar double-counting)
    let polyVol = 0;
    if (refList.length >= 4 && refList.length <= 16) {
      const pts = refList.map(b => b.dr);
      const faces = buildConvexHullFaces(pts);
      const planeMap = new Map();
      const center = pts.reduce((acc, p) => vAdd(acc, p), [0,0,0]).map(x => x / pts.length);
      faces.forEach(([a,b,c]) => {
        let nrm = vCross(vSub(pts[b], pts[a]), vSub(pts[c], pts[a]));
        const nl = vNorm(nrm);
        if (nl < 1e-6) return;
        nrm = vScale(nrm, 1 / nl);
        if (vDot(nrm, vSub(pts[a], center)) < 0) nrm = vScale(nrm, -1);
        const dist = vDot(nrm, pts[a]);
        const key = `${nrm[0].toFixed(2)},${nrm[1].toFixed(2)},${nrm[2].toFixed(2)},${dist.toFixed(2)}`;
        if (!planeMap.has(key)) planeMap.set(key, { nrm, dist, verts: new Set() });
        const entry = planeMap.get(key);
        entry.verts.add(a); entry.verts.add(b); entry.verts.add(c);
      });
      for (const { nrm, dist, verts } of planeMap.values()) {
        const vArr = Array.from(verts).map(idx => pts[idx]);
        if (vArr.length < 3) continue;
        // Project polygon vertices onto plane 2D basis and compute exact polygon area
        const fCenter = vArr.reduce((acc, p) => vAdd(acc, p), [0,0,0]).map(x => x / vArr.length);
        const uAxis = vUnit(vSub(vArr[0], fCenter));
        const vAxis = vCross(nrm, uAxis);
        vArr.sort((p1, p2) => {
          const a1 = Math.atan2(vDot(vSub(p1, fCenter), vAxis), vDot(vSub(p1, fCenter), uAxis));
          const a2 = Math.atan2(vDot(vSub(p2, fCenter), vAxis), vDot(vSub(p2, fCenter), uAxis));
          return a1 - a2;
        });
        let area = 0;
        for (let k=1; k<vArr.length-1; k++) {
          area += 0.5 * vNorm(vCross(vSub(vArr[k], vArr[0]), vSub(vArr[k+1], vArr[0])));
        }
        polyVol += Math.abs(dist) * area / 3.0;
      }
    }
    const bvs = computeSiteBVS(ai.el, neighbors);
    return {
      econ, cn: refList.length, lAvg: meanB, lMin: refList[0].d, lMax: refList[refList.length-1].d,
      distortion, polyVol, bonded: refList, bvs
    };
  }

  function computePairwiseNNBonds() {
    const s = state.structure;
    const L = s.lattice;
    const pairs = new Map();
    for (let i=0; i<s.atoms.length; i++) {
      const ai = s.atoms[i];
      for (let j=i; j<s.atoms.length; j++) {
        const aj = s.atoms[j];
        const key = [ai.el, aj.el].sort().join('–');
        let best = Infinity;
        for (let ix=-1; ix<=1; ix++) for (let iy=-1; iy<=1; iy++) for (let iz=-1; iz<=1; iz++) {
          if (i === j && ix === 0 && iy === 0 && iz === 0) continue;
          const df = [aj.frac[0]-ai.frac[0]+ix, aj.frac[1]-ai.frac[1]+iy, aj.frac[2]-ai.frac[2]+iz];
          const d = vNorm(fracToCart(df, L));
          if (d > 0.4 && d < best) best = d;
        }
        if (isFinite(best)) {
          if (!pairs.has(key) || best < pairs.get(key)) pairs.set(key, best);
        }
      }
    }
    return Array.from(pairs.entries()).map(([pair, d]) => ({ pair, d })).sort((a,b) => a.d - b.d);
  }

  function computeSimulatedXRD(lambda = 1.5406, maxTwoTheta = 80) {
    const s = state.structure;
    const B = getReciprocalLattice(s.lattice);
    const maxS = Math.sin((maxTwoTheta / 2) * Math.PI / 180) / lambda; // 1/(2d)
    const maxH = Math.min(6, Math.ceil((2 * Math.PI * 2 * maxS) / (vNorm(B[0]) || 1)));
    const maxK = Math.min(6, Math.ceil((2 * Math.PI * 2 * maxS) / (vNorm(B[1]) || 1)));
    const maxL = Math.min(6, Math.ceil((2 * Math.PI * 2 * maxS) / (vNorm(B[2]) || 1)));

    const rawPeaks = [];
    for (let h=-maxH; h<=maxH; h++) {
      for (let k=-maxK; k<=maxK; k++) {
        for (let l=-maxL; l<=maxL; l++) {
          if (h===0 && k===0 && l===0) continue;
          const gVec = vAdd(vAdd(vScale(B[0], h), vScale(B[1], k)), vScale(B[2], l));
          const gLen = vNorm(gVec);
          if (gLen < 1e-6) continue;
          const d = (2 * Math.PI) / gLen;
          const sinTh = lambda / (2 * d);
          if (sinTh >= 1 || sinTh <= 0) continue;
          const twoTheta = 2 * Math.asin(sinTh) * 180 / Math.PI;
          if (twoTheta < 5 || twoTheta > maxTwoTheta) continue;

          // Exact International Tables Cromer-Mann 9-parameter form factor + Debye-Waller (B_iso = 0.5 Å^2)
          let re = 0, im = 0;
          const sVal = sinTh / lambda;
          const dw = Math.exp(-0.5 * sVal * sVal);
          for (const a of s.atoms) {
            const fj = cromerMannF0(a.el, sVal) * dw;
            const phase = 2 * Math.PI * (h*a.frac[0] + k*a.frac[1] + l*a.frac[2]);
            re += fj * Math.cos(phase);
            im += fj * Math.sin(phase);
          }
          const f2 = re*re + im*im;
          if (f2 < 1e-2) continue;
          const th = (twoTheta / 2) * Math.PI / 180;
          const lp = (1 + Math.pow(Math.cos(2 * th), 2)) / (Math.sin(th) * Math.sin(th) * Math.cos(th));
          rawPeaks.push({ h, k, l, d, twoTheta, intensity: f2 * lp });
        }
      }
    }
    // Merge equivalent reflections within 0.08 deg
    rawPeaks.sort((a,b) => a.twoTheta - b.twoTheta);
    const merged = [];
    for (const pk of rawPeaks) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.twoTheta - pk.twoTheta) < 0.08) {
        last.intensity += pk.intensity;
        last.mult++;
      } else {
        merged.push({ ...pk, mult: 1 });
      }
    }
    const maxI = Math.max(1e-6, ...merged.map(p => p.intensity));
    return merged
      .map(p => ({ ...p, relI: (p.intensity / maxI) * 100 }))
      .filter(p => p.relI >= 1.5)
      .sort((a,b) => a.twoTheta - b.twoTheta)
      .slice(0, 25);
  }

  function buildFullContcarReportText(format = 'md') {
    const s = state.structure;
    const p = getLatticeParams(s.lattice);
    const sym = state.symmetryResult || analyzeSymmetry();
    const spMap = getSpeciesOrder(s.atoms);
    const formula = Array.from(spMap.entries()).map(([el, list]) => `${el}${list.length > 1 ? list.length : ''}`).join('');
    const totalMass = s.atoms.reduce((sum, a) => sum + getElInfo(a.el).mass, 0);
    const density = p.vol > 1e-6 ? (totalMass / (p.vol * 0.602214076)) : 0;
    const econRows = sym.orbits.map(o => ({ o, ec: computeSiteECoN(o.repIdx) }));

    if (format === 'latex') {
      const bs = '\\';
      const rows = econRows.map(({ o, ec }) =>
        `${o.el} & ${o.wyckoff} & ${o.repFrac[0].toFixed(4)} & ${o.repFrac[1].toFixed(4)} & ${o.repFrac[2].toFixed(4)} & ${ec.econ.toFixed(2)} & ${ec.lAvg.toFixed(3)} ${bs}${bs}`
      ).join('\n');
      return [
        `${bs}begin{table}[h]`,
        `${bs}centering`,
        `${bs}caption{Relaxed VASP structural parameters for ${formula} (${sym.estSG}, $a=${p.a.toFixed(3)}$~${bs}AA, $b=${p.b.toFixed(3)}$~${bs}AA, $c=${p.c.toFixed(3)}$~${bs}AA, $V=${p.vol.toFixed(2)}$~${bs}AA$^3$).}`,
        `${bs}begin{tabular}{lcccccc}`,
        `${bs}hline`,
        `Atom & Wyckoff & $x$ & $y$ & $z$ & ECoN & $${bs}bar{l}$ (${bs}AA) ${bs}${bs}`,
        `${bs}hline`,
        rows,
        `${bs}hline`,
        `${bs}end{tabular}`,
        `${bs}end{table}`
      ].join('\n');
    }

    const lines = [
      `=== VESTA-Web Relaxed CONTCAR Structural Report ===`,
      `Structure:       ${s.name}`,
      `Formula:         ${formula} (${s.atoms.length} atoms)`,
      `Space Group:     ${sym.estSG}  |  Point Group: ${sym.pg}  |  System: ${sym.system} (${sym.centering})`,
      `Symmetry Ops:    ${sym.nOps} (${sym.hasInversion ? 'Centrosymmetric' : 'Non-centrosymmetric'})`,
      `Lattice (Å, °):  a=${p.a.toFixed(4)}, b=${p.b.toFixed(4)}, c=${p.c.toFixed(4)}, α=${p.alpha.toFixed(2)}, β=${p.beta.toFixed(2)}, γ=${p.gamma.toFixed(2)}`,
      `Volume / Density: V=${p.vol.toFixed(3)} Å³ (${(p.vol/s.atoms.length).toFixed(3)} Å³/atom), ρ=${density.toFixed(3)} g/cm³, c/a=${(p.c/p.a).toFixed(4)}`,
      '',
      '--- Wyckoff Positions & Hoppe Effective Coordination Number (ECoN) ---',
      'Site   El   Frac (x, y, z)                 ECoN   CN   l_avg(Å)  Distort(D)  V_poly(Å³)'
    ];
    econRows.forEach(({ o, ec }) => {
      lines.push(
        `${o.wyckoff.padEnd(6)} ${o.el.padEnd(4)} (${o.repFrac.map(x=>x.toFixed(4)).join(', ')})  ` +
        `${ec.econ.toFixed(2).padStart(5)}  ${String(ec.cn).padStart(2)}   ${ec.lAvg.toFixed(4).padStart(7)}   ${ec.distortion.toFixed(5)}    ${ec.polyVol.toFixed(2)}`
      );
    });
    const nnPairs = computePairwiseNNBonds();
    lines.push('', '--- Shortest PBC Pair Distances ---');
    nnPairs.forEach(x => lines.push(`  ${x.pair.padEnd(8)} : ${x.d.toFixed(4)} Å`));
    const xrd = computeSimulatedXRD();
    lines.push('', '--- Simulated Powder XRD Peaks (Cu Kα, λ = 1.5406 Å) ---', '  2θ (°)    d_hkl (Å)   (h  k  l)   Rel. Int (%)');
    xrd.slice(0, 12).forEach(pk => {
      lines.push(`  ${pk.twoTheta.toFixed(2).padStart(6)}    ${pk.d.toFixed(4).padStart(8)}    (${pk.h},${pk.k},${pk.l})`.padEnd(36) + `${pk.relI.toFixed(1).padStart(6)}%`);
    });
    return lines.join('\n') + '\n';
  }

  // =========================================================================
  // 7. THREE.JS 3D CRYSTALLOGRAPHY RENDERING ENGINE
  // =========================================================================
  const container = document.getElementById('three-container');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const rootGroup = new THREE.Group();
  scene.add(rootGroup);

  const perspCam = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
  const orthoCam = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 500);
  let activeCam = orthoCam;

  // Publication-grade VESTA lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.58));
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.72);
  dirLight1.position.set(12, 18, 22);
  scene.add(dirLight1);
  const dirLight2 = new THREE.DirectionalLight(0xdbeafe, 0.35);
  dirLight2.position.set(-16, -10, -14);
  scene.add(dirLight2);

  // Custom Smooth Trackball / Orbit Camera State
  const camState = {
    target: new THREE.Vector3(0,0,0),
    quat: new THREE.Quaternion(),
    dist: 18,
    orthoSize: 7.5
  };
  function updateCameraTransform() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    const aspect = w / h;
    renderer.setSize(w, h, false);

    const offset = new THREE.Vector3(0, 0, camState.dist).applyQuaternion(camState.quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camState.quat);

    perspCam.aspect = aspect;
    perspCam.position.copy(camState.target).add(offset);
    perspCam.up.copy(up);
    perspCam.lookAt(camState.target);
    perspCam.updateProjectionMatrix();

    orthoCam.left = -camState.orthoSize * aspect;
    orthoCam.right = camState.orthoSize * aspect;
    orthoCam.top = camState.orthoSize;
    orthoCam.bottom = -camState.orthoSize;
    orthoCam.position.copy(camState.target).add(offset);
    orthoCam.up.copy(up);
    orthoCam.lookAt(camState.target);
    orthoCam.updateProjectionMatrix();

    activeCam = state.isOrtho ? orthoCam : perspCam;
    drawAxesGizmo();
    updateProjectedLabels();
  }

  function setCameraViewDirection(dirVec, upHint) {
    const z = new THREE.Vector3(...dirVec).normalize();
    let up = new THREE.Vector3(...(upHint || [0,1,0])).normalize();
    if (Math.abs(z.dot(up)) > 0.96) up = new THREE.Vector3(1, 0, 0);
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    camState.quat.setFromRotationMatrix(m);
    updateCameraTransform();
  }

  function fitCameraToStructure() {
    if (!state.structure) return;
    const L = state.structure.lattice;
    const center = fracToCart([0.5, 0.5, 0.5], L);
    camState.target.set(center[0], center[1], center[2]);
    const diag = Math.max(
      vNorm(vAdd(vAdd(L[0], L[1]), L[2])),
      vNorm(L[0]), vNorm(L[1]), vNorm(L[2])
    );
    const span = Math.max(4, diag * 0.85);
    // Portrait viewports (phones, narrow panels) are limited by width, so widen the fit by the aspect ratio.
    const aspect = Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
    const portrait = Math.min(1, aspect);
    camState.orthoSize = (span * 0.92) / portrait;
    camState.dist = (span * 2.8) / portrait;
    updateCameraTransform();
  }

  // Render Cache for Raycasting & Labels
  let displayedAtoms = []; // { origIdx, el, frac, cart, mag, mesh }
  const atomMeshes = [];
  const sphereGeo = new THREE.SphereGeometry(1, 28, 22);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
  const coneGeo = new THREE.ConeGeometry(1, 1, 16);

  function clearGroup(g) {
    while (g.children.length > 0) {
      const obj = g.children[0];
      g.remove(obj);
      if (obj.geometry && obj.geometry !== sphereGeo && obj.geometry !== cylGeo && obj.geometry !== coneGeo) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
  }

  // Simple 3D Convex Hull for small coordination polyhedra (4..12 vertices)
  function buildConvexHullFaces(pts) {
    const n = pts.length;
    if (n < 4) return [];
    const faces = [];
    const center = pts.reduce((acc, p) => vAdd(acc, p), [0,0,0]).map(x => x / n);
    for (let i=0; i<n; i++) {
      for (let j=i+1; j<n; j++) {
        for (let k=j+1; k<n; k++) {
          let normal = vCross(vSub(pts[j], pts[i]), vSub(pts[k], pts[i]));
          const nl = vNorm(normal);
          if (nl < 1e-6) continue;
          normal = vScale(normal, 1/nl);
          // Orient outward from center
          let a = i, b = j, c = k;
          if (vDot(normal, vSub(pts[i], center)) < 0) {
            normal = vScale(normal, -1);
            b = k; c = j;
          }
          let allInside = true;
          for (let m=0; m<n; m++) {
            if (m===i || m===j || m===k) continue;
            if (vDot(normal, vSub(pts[m], pts[a])) > 0.04) { allInside = false; break; }
          }
          if (allInside) faces.push([a, b, c]);
        }
      }
    }
    return faces;
  }

  function rebuildScene() {
    clearGroup(rootGroup);
    displayedAtoms = [];
    atomMeshes.length = 0;
    const s = state.structure;
    if (!s) return;
    const L = s.lattice;
    const bnd = state.boundary;

    // 1. Generate displayed atoms within visual boundary
    const ixMin = Math.floor(bnd.xmin) - 1, ixMax = Math.ceil(bnd.xmax) + 1;
    const iyMin = Math.floor(bnd.ymin) - 1, iyMax = Math.ceil(bnd.ymax) + 1;
    const izMin = Math.floor(bnd.zmin) - 1, izMax = Math.ceil(bnd.zmax) + 1;

    s.atoms.forEach((a, origIdx) => {
      const cfg = state.speciesConfig[a.el] || { color: getElInfo(a.el).color, visible: true, polyCenter: false };
      if (!cfg.visible) return;
      for (let ix=ixMin; ix<=ixMax; ix++) {
        const fx = a.frac[0] + ix;
        if (fx < bnd.xmin - 1e-4 || fx > bnd.xmax + 1e-4) continue;
        for (let iy=iyMin; iy<=iyMax; iy++) {
          const fy = a.frac[1] + iy;
          if (fy < bnd.ymin - 1e-4 || fy > bnd.ymax + 1e-4) continue;
          for (let iz=izMin; iz<=izMax; iz++) {
            const fz = a.frac[2] + iz;
            if (fz < bnd.zmin - 1e-4 || fz > bnd.zmax + 1e-4) continue;
            const cart = fracToCart([fx, fy, fz], L);
            displayedAtoms.push({ origIdx, el: a.el, frac:[fx,fy,fz], cart, mag: a.mag, sel: a.sel, cfg });
          }
        }
      }
    });

    // 2. Render Atoms
    const isWire = state.styleMode === 'wireframe';
    const isStick = state.styleMode === 'stick';
    const isSpace = state.styleMode === 'spacefill';

    displayedAtoms.forEach((da, dIdx) => {
      const info = getElInfo(da.el);
      const rad = isSpace ? info.r * 1.15 : (isStick ? state.bondRadius * 1.05 : (isWire ? 0.08 : info.r * state.atomScale));
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(da.cfg.color),
        roughness: 0.34,
        metalness: 0.14
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.set(da.cart[0], da.cart[1], da.cart[2]);
      mesh.scale.setScalar(rad);
      mesh.userData = { dIdx, origIdx: da.origIdx };
      rootGroup.add(mesh);
      atomMeshes.push(mesh);
      da.mesh = mesh;

      // Selection Halo
      if (state.selectedAtomIndices.includes(da.origIdx)) {
        const haloMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: true, transparent: true, opacity: 0.9 });
        const halo = new THREE.Mesh(sphereGeo, haloMat);
        halo.position.copy(mesh.position);
        halo.scale.setScalar(rad * 1.28);
        rootGroup.add(halo);
      }
    });

    // 3. Compute & Render Bonds (and Neighbor list for Polyhedra)
    const neighbors = displayedAtoms.map(() => []);
    if (!isSpace) {
      const nD = displayedAtoms.length;
      for (let i=0; i<nD; i++) {
        const ai = displayedAtoms[i];
        const ri = getElInfo(ai.el).r;
        for (let j=i+1; j<nD; j++) {
          const aj = displayedAtoms[j];
          const maxD = (ri + getElInfo(aj.el).r) * state.bondCutoff;
          const dv = vSub(aj.cart, ai.cart);
          const dist = vNorm(dv);
          if (dist > 0.35 && dist <= maxD) {
            neighbors[i].push(aj.cart);
            neighbors[j].push(ai.cart);
            const p1 = new THREE.Vector3(...ai.cart);
            const p2 = new THREE.Vector3(...aj.cart);
            if (isWire) {
              const g = new THREE.BufferGeometry().setFromPoints([p1, p2]);
              const m = new THREE.LineBasicMaterial({ color: state.dark ? 0x94a3b8 : 0x475569 });
              rootGroup.add(new THREE.Line(g, m));
            } else {
              // Two-tone half-bonds like VESTA!
              const mid = p1.clone().lerp(p2, 0.5);
              addCylinderSegment(p1, mid, state.bondRadius, ai.cfg.color);
              addCylinderSegment(mid, p2, state.bondRadius, aj.cfg.color);
            }
          }
        }
      }
    }

    // 4. Render Coordination Polyhedra
    if (state.styleMode === 'polyhedral') {
      displayedAtoms.forEach((da, i) => {
        if (!da.cfg.polyCenter) return;
        const pts = neighbors[i];
        if (pts.length < 4 || pts.length > 14) return;
        const faces = buildConvexHullFaces(pts);
        if (faces.length === 0) return;
        const posArr = [];
        const edgePts = [];
        faces.forEach(([a,b,c]) => {
          posArr.push(...pts[a], ...pts[b], ...pts[c]);
          edgePts.push(new THREE.Vector3(...pts[a]), new THREE.Vector3(...pts[b]));
          edgePts.push(new THREE.Vector3(...pts[b]), new THREE.Vector3(...pts[c]));
          edgePts.push(new THREE.Vector3(...pts[c]), new THREE.Vector3(...pts[a]));
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(da.cfg.color),
          transparent: true,
          opacity: state.polyOpacity,
          roughness: 0.4,
          metalness: 0.05,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        rootGroup.add(new THREE.Mesh(geo, mat));
        if (state.showPolyEdges) {
          const eg = new THREE.BufferGeometry().setFromPoints(edgePts);
          const em = new THREE.LineBasicMaterial({ color: state.dark ? 0xe2e8f0 : 0x1e293b, transparent: true, opacity: 0.65 });
          rootGroup.add(new THREE.LineSegments(eg, em));
        }
      });
    }

    // 5. Render Magnetic Moment Vectors (3D Arrows)
    if (state.showVectors) {
      displayedAtoms.forEach(da => {
        const mLen = vNorm(da.mag);
        if (mLen < 0.05) return;
        const rawDir = new THREE.Vector3(...da.mag).normalize();
        const dir = rawDir.clone();
        // Tilt collinear ±z arrows by vecTiltDeg (default 45°) toward [-1,1,0] so they stay clear of all [100]/[010]/[001] bonds AND are clearly visible broadside
        if (state.vecTiltDeg > 0 && state.magMode === 'collinear' && Math.abs(rawDir.x) < 1e-4 && Math.abs(rawDir.y) < 1e-4) {
          const sign = rawDir.z >= 0 ? 1 : -1;
          const rad = state.vecTiltDeg * Math.PI / 180;
          const diag = Math.SQRT1_2;
          dir.set(-sign * Math.sin(rad) * diag, sign * Math.sin(rad) * diag, sign * Math.cos(rad)).normalize();
        }
        const atomRad = getElInfo(da.el).r * state.atomScale;
        const totalLen = Math.max(atomRad * 3.8, mLen * state.vecScale + atomRad * 1.65);
        const headLen = Math.min(0.62, totalLen * 0.32);
        const shaftLen = Math.max(0.3, totalLen - headLen);
        const col = da.mag[2] >= -1e-4 ? state.magUpColor : state.magDnColor;

        const center = new THREE.Vector3(...da.cart);
        const start = center.clone().addScaledVector(dir, -totalLen * 0.42);
        const shaftEnd = start.clone().addScaledVector(dir, shaftLen);
        const tip = start.clone().addScaledVector(dir, totalLen);

        addCylinderSegment(start, shaftEnd, 0.095, col);
        const coneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: 0.28, metalness: 0.12 });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.copy(shaftEnd).lerp(tip, 0.5);
        cone.scale.set(0.24, headLen, 0.24);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
        rootGroup.add(cone);
      });
    }

    // 6. Render Unit Cell Box
    if (state.showUnitCell) {
      const o = [0,0,0], a = L[0], b = L[1], c = L[2];
      const ab = vAdd(a,b), ac = vAdd(a,c), bc = vAdd(b,c), abc = vAdd(ab,c);
      const cellCol = state.dark ? 0x64748b : 0x334155;
      const edges = [
        [o,a,0xef4444], [o,b,0x22c55e], [o,c,0x3b82f6],
        [a,ab,cellCol], [a,ac,cellCol], [b,ab,cellCol], [b,bc,cellCol],
        [c,ac,cellCol], [c,bc,cellCol], [ab,abc,cellCol], [ac,abc,cellCol], [bc,abc,cellCol]
      ];
      edges.forEach(([p1, p2, col]) => {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...p1), new THREE.Vector3(...p2)]);
        const m = new THREE.LineBasicMaterial({ color: col });
        rootGroup.add(new THREE.Line(g, m));
      });
    }

    // 7. Render Active Measurement Picking Markers (P1, P2, P3...) & Completed 3D Lines
    state.measureQueue.forEach((qa) => {
      const pMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true });
      const pin = new THREE.Mesh(sphereGeo, pMat);
      pin.position.set(qa.cart[0], qa.cart[1], qa.cart[2]);
      pin.scale.setScalar(getElInfo(qa.el).r * state.atomScale * 1.42);
      rootGroup.add(pin);
    });
    state.measureQueue.forEach((qa, idx) => {
      const p = projectPt(qa.cart);
      if (!p) return;
      const pinBadge = document.createElement('div');
      pinBadge.className = 'absolute text-[10px] font-mono-code font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 shadow ring-2 ring-white';
      pinBadge.style.left = `${p.x}px`;
      pinBadge.style.top = `${p.y - 18}px`;
      pinBadge.style.transform = 'translate(-50%, -50%)';
      pinBadge.textContent = `P${idx + 1}: ${qa.el}${qa.origIdx + 1}`;
      overlay.appendChild(pinBadge);
    });

    state.measurements.forEach(meas => {
      const pts = meas.pts.map(p => new THREE.Vector3(...p));
      for (let k=0; k<pts.length-1; k++) {
        addCylinderSegment(pts[k], pts[k+1], 0.055, '#f59e0b');
      }
      pts.forEach(pt => {
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        const dot = new THREE.Mesh(sphereGeo, dotMat);
        dot.position.copy(pt);
        dot.scale.setScalar(0.14);
        rootGroup.add(dot);
      });
    });

    updateProjectedLabels();
  }

  function addCylinderSegment(p1, p2, radius, colorHex) {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len < 1e-5) return;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.38, metalness: 0.12 });
    const mesh = new THREE.Mesh(cylGeo, mat);
    mesh.position.copy(p1).lerp(p2, 0.5);
    mesh.scale.set(radius, len, radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
    rootGroup.add(mesh);
  }

  // Projected 2D Labels (Atom Labels & Measurement Badges)
  function updateProjectedLabels() {
    const overlay = document.getElementById('labels-overlay');
    overlay.innerHTML = '';
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;

    const projectPt = (cart) => {
      const v = new THREE.Vector3(...cart).project(activeCam);
      if (v.z > 1) return null;
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };

    if (state.showLabels) {
      displayedAtoms.forEach(da => {
        const p = projectPt(da.cart);
        if (!p) return;
        const el = document.createElement('div');
        el.className = 'absolute text-[10px] font-mono-code font-bold px-1 rounded shadow-xs';
        el.style.left = `${p.x + 6}px`;
        el.style.top = `${p.y - 10}px`;
        el.style.background = state.dark ? 'rgba(15,19,26,0.78)' : 'rgba(255,255,255,0.82)';
        el.style.color = state.dark ? '#f1f5f9' : '#0f172a';
        el.textContent = `${da.el}${da.origIdx + 1}`;
        overlay.appendChild(el);
      });
    }

    state.measurements.forEach(meas => {
      const mid = meas.pts.reduce((a,b) => vAdd(a,b), [0,0,0]).map(x => x / meas.pts.length);
      const p = projectPt(mid);
      if (!p) return;
      const badge = document.createElement('div');
      badge.className = 'absolute text-[10.5px] font-mono-code font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 shadow';
      badge.style.left = `${p.x}px`;
      badge.style.top = `${p.y}px`;
      badge.style.transform = 'translate(-50%, -50%)';
      badge.textContent = meas.label;
      overlay.appendChild(badge);
    });
  }

  // Corner 3D Crystallographic Axes Gizmo (a, b, c)
  function drawAxesGizmo() {
    const cvs = document.getElementById('axes-gizmo');
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    if (!state.structure) return;
    const L = state.structure.lattice;
    const invQ = camState.quat.clone().invert();
    const cx = 54, cy = 54, len = 34;
    const axes = [
      { v: vUnit(L[0]), label: 'a', color: '#ef4444' },
      { v: vUnit(L[1]), label: 'b', color: '#22c55e' },
      { v: vUnit(L[2]), label: 'c', color: '#3b82f6' }
    ].map(ax => {
      const tv = new THREE.Vector3(...ax.v).applyQuaternion(invQ);
      return { ...ax, x: tv.x, y: -tv.y, z: tv.z };
    }).sort((a,b) => a.z - b.z);

    axes.forEach(ax => {
      const ex = cx + ax.x * len, ey = cy + ax.y * len;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = ax.color;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.fillStyle = ax.color;
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ax.label, cx + ax.x * (len + 11), cy + ax.y * (len + 11));
    });
  }

  // Animation Loop
  let animId = null;
  function animate() {
    animId = requestAnimationFrame(animate);
    renderer.render(scene, activeCam);
  }

  // =========================================================================
  // 8. INTERACTIVE MOUSE / TOUCH CONTROLS & RAYCASTING
  // =========================================================================
  const raycaster = new THREE.Raycaster();
  let isDragging = false, dragMoved = false, prevX = 0, prevY = 0, activeButton = 0;

  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', e => {
    isDragging = true;
    dragMoved = false;
    prevX = e.clientX;
    prevY = e.clientY;
    activeButton = e.button;
    renderer.domElement.setPointerCapture(e.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', e => {
    if (!isDragging) return;
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    if (Math.hypot(dx, dy) > 2) dragMoved = true;
    prevX = e.clientX;
    prevY = e.clientY;

    const mode = activeButton === 2 ? 'pan' : (activeButton === 1 ? 'zoom' : state.tool);
    if (mode === 'rotate' || (mode === 'select' && dragMoved) || (['distance','angle','dihedral'].includes(mode) && dragMoved)) {
      const speed = 0.0075;
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), -dx * speed);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -dy * speed);
      camState.quat.multiply(qYaw).multiply(qPitch).normalize();
      updateCameraTransform();
    } else if (mode === 'pan') {
      const scale = camState.orthoSize * 2 / Math.max(1, container.clientHeight);
      const right = new THREE.Vector3(1,0,0).applyQuaternion(camState.quat);
      const up = new THREE.Vector3(0,1,0).applyQuaternion(camState.quat);
      camState.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
      updateCameraTransform();
    } else if (mode === 'zoom') {
      const factor = Math.exp(dy * 0.008);
      camState.orthoSize = Math.max(1.2, Math.min(80, camState.orthoSize * factor));
      camState.dist = Math.max(3, Math.min(180, camState.dist * factor));
      updateCameraTransform();
    }
  });

  renderer.domElement.addEventListener('pointerup', e => {
    if (!isDragging) return;
    isDragging = false;
    if (!dragMoved && activeButton === 0) {
      handleViewportClick(e);
    }
  });

  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.91;
    camState.orthoSize = Math.max(1.2, Math.min(80, camState.orthoSize * factor));
    camState.dist = Math.max(3, Math.min(180, camState.dist * factor));
    updateCameraTransform();
  }, { passive: false });

  function handleViewportClick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(mouse, activeCam);
    const hits = raycaster.intersectObjects(atomMeshes, false);
    if (hits.length === 0) {
      if (state.tool === 'select' && !e.shiftKey) {
        state.selectedAtomIndices = [];
        syncSelectionUI();
        rebuildScene();
      }
      return;
    }
    const { dIdx, origIdx } = hits[0].object.userData;
    const da = displayedAtoms[dIdx];
    const atom = state.structure.atoms[origIdx];

    if (['distance', 'angle', 'dihedral'].includes(state.tool)) {
      state.measureQueue.push(da);
      const need = state.tool === 'distance' ? 2 : (state.tool === 'angle' ? 3 : 4);
      const stepNum = state.measureQueue.length;
      document.getElementById('hud-tool-hint').textContent =
        stepNum < need
          ? `Start P${stepNum}: ${da.el}${origIdx+1} selected → Click atom ${stepNum+1} of ${need}`
          : TOOL_HINTS[state.tool];
      logConsole(`Picked P${stepNum}: ${da.el}${origIdx+1} at (${da.cart.map(x=>x.toFixed(3)).join(', ')}) Å`);
      if (stepNum < need) {
        rebuildScene();
        return;
      }
      const q = state.measureQueue;
      if (need === 2) {
        const dv = vSub(q[1].cart, q[0].cart);
        const dDirect = vNorm(dv);
        const dPbc = pbcDist(state.structure.atoms[q[0].origIdx].frac, state.structure.atoms[q[1].origIdx].frac, state.structure.lattice);
        const lbl = `${dDirect.toFixed(4)} Å`;
        state.measurements.push({ type:'dist', pts:[q[0].cart, q[1].cart], label: lbl });
        logConsole(`Distance ${q[0].el}${q[0].origIdx+1} → ${q[1].el}${q[1].origIdx+1}: Direct = ${dDirect.toFixed(4)} Å | Min-Image PBC = ${dPbc.toFixed(4)} Å | Δ=(${dv.map(x=>x.toFixed(3)).join(', ')})`, 'accent');
        showToast(`${q[0].el}${q[0].origIdx+1}–${q[1].el}${q[1].origIdx+1} = ${lbl}`);
      } else if (need === 3) {
        const v1 = vUnit(vSub(q[0].cart, q[1].cart));
        const v2 = vUnit(vSub(q[2].cart, q[1].cart));
        const ang = Math.acos(Math.max(-1, Math.min(1, vDot(v1, v2)))) * 180 / Math.PI;
        const lbl = `${ang.toFixed(2)}°`;
        state.measurements.push({ type:'ang', pts:[q[0].cart, q[1].cart, q[2].cart], label: lbl });
        logConsole(`Angle ${q[0].el}${q[0].origIdx+1}–${q[1].el}${q[1].origIdx+1}–${q[2].el}${q[2].origIdx+1} = ${lbl}`, 'accent');
        showToast(`Angle = ${lbl}`);
      } else if (need === 4) {
        const b1 = vSub(q[1].cart, q[0].cart), b2 = vSub(q[2].cart, q[1].cart), b3 = vSub(q[3].cart, q[2].cart);
        const n1 = vUnit(vCross(b1, b2)), n2 = vUnit(vCross(b2, b3));
        const m1 = vCross(n1, vUnit(b2));
        const dih = Math.atan2(vDot(m1, n2), vDot(n1, n2)) * 180 / Math.PI;
        const lbl = `${dih.toFixed(2)}°`;
        state.measurements.push({ type:'dih', pts:q.map(x=>x.cart), label: lbl });
        logConsole(`Dihedral = ${lbl}`, 'accent');
        showToast(`Dihedral = ${lbl}`);
      }
      state.measureQueue = [];
      rebuildScene();
      return;
    }

    // Select atom
    if (e.shiftKey) {
      const pos = state.selectedAtomIndices.indexOf(origIdx);
      if (pos >= 0) state.selectedAtomIndices.splice(pos, 1);
      else state.selectedAtomIndices.push(origIdx);
    } else {
      state.selectedAtomIndices = [origIdx];
    }
    logConsole(
      `Atom #${origIdx+1} [${atom.el}] frac=(${atom.frac.map(x=>x.toFixed(4)).join(', ')}) ` +
      `mag=(${atom.mag.map(x=>x.toFixed(2)).join(', ')}) μB sel=(${atom.sel.map(b=>b?'T':'F').join(' ')})`
    );
    syncSelectionUI();
    rebuildScene();
  }

  // =========================================================================
  // 9. UI HELPERS, LOGGING & SYNC FUNCTIONS
  // =========================================================================
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('opacity-0'), 2400);
  }

  function logConsole(msg, tone = 'normal') {
    const log = document.getElementById('console-log');
    const row = document.createElement('div');
    const ts = new Date().toLocaleTimeString([], { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
    row.className = tone === 'accent' ? 'text-blue-500 font-semibold' : (tone === 'warn' ? 'text-amber-500' : 'text-sub');
    row.textContent = `[${ts}] ${msg}`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function copyToClipboard(text, label) {
    const done = () => showToast(`Copied ${label} to clipboard`);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(_) {}
    document.body.removeChild(ta);
    cb();
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`);
  }

  function initSpeciesConfig() {
    const s = state.structure;
    const spMap = getSpeciesOrder(s.atoms);
    const nextCfg = {};
    for (const el of spMap.keys()) {
      const prev = state.speciesConfig[el];
      nextCfg[el] = {
        color: prev ? prev.color : getElInfo(el).color,
        visible: prev ? prev.visible : true,
        polyCenter: (s.polyCenters || []).includes(el) || (prev ? prev.polyCenter : false)
      };
    }
    state.speciesConfig = nextCfg;
  }

  function syncSelectionUI() {
    const sel = state.selectedAtomIndices;
    document.getElementById('selection-badge').textContent = `${sel.length} selected`;
    const hud = document.getElementById('selection-hud');
    const infoEl = document.getElementById('sel-hud-info');
    const distEl = document.getElementById('sel-hud-dist');
    const siteBadge = document.getElementById('cat-site-badge');

    if (!state.structure || sel.length === 0) {
      hud.classList.add('hidden');
      hud.classList.remove('flex');
      if (siteBadge) siteBadge.textContent = 'Auto top-z';
      return;
    }
    hud.classList.remove('hidden');
    hud.classList.add('flex');

    if (sel.length === 1) {
      const a = state.structure.atoms[sel[0]];
      infoEl.textContent = `#${sel[0]+1} ${a.el} (${a.frac.map(x=>x.toFixed(3)).join(', ')}) [${a.sel.map(b=>b?'T':'F').join('')}]`;
      distEl.classList.add('hidden');
      if (siteBadge) siteBadge.textContent = `Top: ${a.el}${sel[0]+1}`;
    } else if (sel.length === 2) {
      const a1 = state.structure.atoms[sel[0]], a2 = state.structure.atoms[sel[1]];
      const dPbc = pbcDist(a1.frac, a2.frac, state.structure.lattice);
      infoEl.textContent = `${a1.el}${sel[0]+1} & ${a2.el}${sel[1]+1}`;
      distEl.textContent = `d = ${dPbc.toFixed(4)} Å`;
      distEl.classList.remove('hidden');
      if (siteBadge) siteBadge.textContent = `Bridge: ${a1.el}${sel[0]+1}–${a2.el}${sel[1]+1}`;
    } else {
      infoEl.textContent = `${sel.length} atoms selected`;
      distEl.classList.add('hidden');
      if (siteBadge) siteBadge.textContent = sel.length === 3 ? 'Hollow (3 atoms)' : `${sel.length} sites`;
    }
  }

  function refreshAllUI(runSym = true) {
    const s = state.structure;
    if (!s) return;
    initSpeciesConfig();
    document.getElementById('hud-title').textContent = `${s.name} (${s.atoms.length} atoms)`;
    document.getElementById('chk-seldyn').checked = !!s.selectiveDynamics;

    // 1. Species List (Boundary tab)
    const spMap = getSpeciesOrder(s.atoms);
    const spListEl = document.getElementById('species-list');
    spListEl.innerHTML = '';
    const magTarget = document.getElementById('mag-target');
    const prevTarget = magTarget.value;
    magTarget.innerHTML = '<option value="selected">Selected Atoms</option>';

    const magSub = document.getElementById('mag-sublattice');
    const prevSub = magSub.value;
    magSub.innerHTML = '<option value="auto3d">Auto (3d metals)</option><option value="auto3d4f">3d + 4f metals</option>';

    for (const [el, list] of spMap.entries()) {
      const cfg = state.speciesConfig[el];
      const opt = document.createElement('option');
      opt.value = `el:${el}`;
      opt.textContent = `All ${el} atoms (${list.length})`;
      magTarget.appendChild(opt);

      const sopt = document.createElement('option');
      sopt.value = `el:${el}`;
      sopt.textContent = `${el} only (${list.length} atoms)`;
      magSub.appendChild(sopt);

      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-1.5 py-1 px-1.5 rounded border border-subtle';
      row.innerHTML = `
        <div class="flex items-center gap-1.5">
          <input type="color" value="${cfg.color}" class="w-4 h-4 border-0 bg-transparent cursor-pointer sp-col" data-el="${el}" aria-label="Colour of ${el}" />
          <span class="font-mono-code font-bold text-main">${el}</span>
          <span class="text-[10px] text-mut">(${list.length})</span>
        </div>
        <div class="flex items-center gap-1.5">
          <label class="flex items-center gap-0.5 text-[10px] text-sub cursor-pointer" title="Use as Polyhedra Center">
            <input type="checkbox" ${cfg.polyCenter ? 'checked' : ''} class="sp-poly accent-blue-600" data-el="${el}" /> Poly
          </label>
          <input type="checkbox" ${cfg.visible ? 'checked' : ''} class="sp-vis accent-blue-600" data-el="${el}" title="Show/Hide ${el}" />
        </div>
      `;
      spListEl.appendChild(row);
    }
    if ([...magTarget.options].some(o => o.value === prevTarget)) magTarget.value = prevTarget;
    if ([...magSub.options].some(o => o.value === prevSub)) magSub.value = prevSub;

    spListEl.querySelectorAll('.sp-col').forEach(inp => inp.addEventListener('input', e => {
      state.speciesConfig[e.target.dataset.el].color = e.target.value;
      rebuildScene();
    }));
    spListEl.querySelectorAll('.sp-vis').forEach(inp => inp.addEventListener('change', e => {
      state.speciesConfig[e.target.dataset.el].visible = e.target.checked;
      rebuildScene();
    }));
    spListEl.querySelectorAll('.sp-poly').forEach(inp => inp.addEventListener('change', e => {
      const el = e.target.dataset.el;
      state.speciesConfig[el].polyCenter = e.target.checked;
      if (e.target.checked && state.styleMode !== 'polyhedral') {
        setStyleMode('polyhedral');
      } else {
        rebuildScene();
      }
    }));

    // 2. Lattice & Formula Info
    const p = getLatticeParams(s.lattice);
    const B = getReciprocalLattice(s.lattice);
    const formula = Array.from(spMap.entries()).map(([el, list]) => `${el}${list.length > 1 ? list.length : ''}`).join('');
    const totalMass = s.atoms.reduce((sum, a) => sum + getElInfo(a.el).mass, 0);
    const density = p.vol > 1e-6 ? (totalMass / (p.vol * 0.602214076)) : 0;

    document.getElementById('info-formula').textContent = formula;
    document.getElementById('info-natoms').textContent = String(s.atoms.length);
    document.getElementById('info-vol').textContent = `${p.vol.toFixed(2)} Å³`;
    document.getElementById('info-density').textContent = `${density.toFixed(2)} g/cm³`;
    document.getElementById('info-cell-params').innerHTML = `
      <span>a = ${p.a.toFixed(4)} Å</span><span>α = ${p.alpha.toFixed(2)}°</span>
      <span>b = ${p.b.toFixed(4)} Å</span><span>β = ${p.beta.toFixed(2)}°</span>
      <span>c = ${p.c.toFixed(4)} Å</span><span>γ = ${p.gamma.toFixed(2)}°</span>
    `;
    const fmtMat = (M) => M.map((r, i) => `${['a₁','a₂','a₃'][i]}: ${r.map(x => (x>=0?' ':'')+x.toFixed(4)).join('  ')}`).join('\n');
    const fmtRec = (M) => M.map((r, i) => `${['b₁','b₂','b₃'][i]}: ${r.map(x => (x>=0?' ':'')+x.toFixed(4)).join('  ')}`).join('\n');
    document.getElementById('info-direct-mat').textContent = fmtMat(s.lattice);
    document.getElementById('info-recip-mat').textContent = fmtRec(B);

    // 3. Symmetry Analysis
    if (runSym) {
      const tol = parseFloat(document.getElementById('sym-tol').value) || 0.001;
      const sym = analyzeSymmetry(tol);
      renderSymmetryUI(sym);
    }

    // 4. Magnetic UI
    renderMagneticUI();

    // 5. Atoms Table
    renderAtomsTable();

    // 6. Supercell Preview Count
    updateSupercellPreview();

    // 7. VASP File Preview
    refreshVaspPreview();

    // 8. 3D Scene
    syncSelectionUI();
    rebuildScene();
  }

  function renderSymmetryUI(sym) {
    const p = getLatticeParams(state.structure.lattice);
    const vPerAtom = p.vol / Math.max(1, state.structure.atoms.length);
    document.getElementById('info-sg').textContent = sym.estSG;
    document.getElementById('sym-system').textContent = sym.system;
    document.getElementById('sym-centering').textContent = sym.centering;
    document.getElementById('sym-pg').textContent = `${sym.centering} · ${sym.pg}`;
    document.getElementById('sym-sg').textContent = sym.estSG;
    document.getElementById('sym-nops').textContent = `${sym.nOps} (${sym.nPg} PG)`;
    document.getElementById('sym-inv').textContent = sym.hasInversion ? 'Yes (Centrosym.)' : 'No (Non-centrosym.)';
    document.getElementById('sym-bulk-meta').textContent = `${vPerAtom.toFixed(2)} Å³ · ${(p.c/(p.a||1)).toFixed(3)}`;
    document.getElementById('sym-orbit-count').textContent = `${sym.orbits.length} Wyckoff`;

    const orbEl = document.getElementById('sym-orbits-list');
    const econEl = document.getElementById('econ-list');
    orbEl.innerHTML = '';
    econEl.innerHTML = '';

    sym.orbits.forEach((o) => {
      const d = document.createElement('div');
      d.className = 'flex items-center justify-between px-1.5 py-1 rounded border border-subtle hover:bg-[var(--bg-hover)] cursor-pointer';
      d.innerHTML = `
        <span class="font-mono-code font-semibold text-main">${o.wyckoff} <b>${o.el}</b> <span class="text-mut font-normal">[×${o.siteSymOrder}]</span></span>
        <span class="font-mono-code text-sub">(${o.repFrac.map(x=>x.toFixed(4)).join(', ')})</span>
      `;
      d.addEventListener('click', () => {
        state.selectedAtomIndices = [...o.indices];
        syncSelectionUI();
        rebuildScene();
        logConsole(`Wyckoff ${o.wyckoff} (${o.el}): frac=(${o.repFrac.map(x=>x.toFixed(4)).join(', ')}), ${o.indices.length} sites`);
      });
      orbEl.appendChild(d);

      const ec = computeSiteECoN(o.repIdx);
      const erow = document.createElement('div');
      erow.className = 'px-1.5 py-1 rounded border border-subtle space-y-0.5';
      erow.innerHTML = `
        <div class="flex justify-between">
          <span class="font-bold text-main">${o.wyckoff} (${o.el})</span>
          <span class="text-blue-500 font-bold">ECoN = ${ec.econ.toFixed(2)} <span class="text-mut font-normal">(CN ${ec.cn})</span></span>
        </div>
        <div class="flex justify-between text-[9.5px] text-sub">
          <span>l̄ = ${ec.lAvg.toFixed(3)} Å [${ec.lMin.toFixed(2)}–${ec.lMax.toFixed(2)}]</span>
          <span>D = ${ec.distortion.toFixed(4)}${ec.polyVol > 0.01 ? ` · Vp=${ec.polyVol.toFixed(2)} Å³` : ''}</span>
        </div>
        ${ec.bvs ? `<div class="text-[9.5px] text-emerald-600 dark:text-emerald-400">BVS: ${ec.bvs.map(b => `${b.label} = ${b.val.toFixed(2)} v.u.`).join(' | ')}</div>` : ''}
      `;
      econEl.appendChild(erow);
    });

    const nnEl = document.getElementById('nn-pairs-list');
    const nnPairs = computePairwiseNNBonds();
    nnEl.innerHTML = nnPairs.map(x =>
      `<div class="flex justify-between px-1 py-0.5 rounded hover:bg-[var(--bg-hover)]"><span class="font-semibold text-main">${x.pair}</span><span>${x.d.toFixed(4)} Å</span></div>`
    ).join('') || '<div class="text-mut">No pairs within range</div>';

    // Multi-Tolerance Symmetry Breaking Scan (like spglib/pymatgen symprec scan)
    const curTol = parseFloat(document.getElementById('sym-tol').value) || 0.001;
    const savedSym = state.symmetryResult;
    const scanTols = [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1];
    const scanResults = scanTols.map(t => {
      const r = analyzeSymmetry(t);
      return { tol: t, sg: r.estSG, pg: r.pg, nOps: r.nOps };
    });
    state.symmetryResult = savedSym; // restore active tolerance result

    const ladderEl = document.getElementById('sym-tol-ladder');
    ladderEl.innerHTML = scanResults.map(r => {
      const active = Math.abs(r.tol - curTol) < 1e-6;
      return `<button class="v-btn py-0.5 px-1 flex-col leading-tight ${active ? 'v-btn-active' : ''}" data-scan-tol="${r.tol}">
        <span class="text-[8.5px] text-mut">${r.tol} Å</span>
        <span class="font-bold text-[9.5px] truncate max-w-full">${r.sg.split(' ')[0]}</span>
      </button>`;
    }).join('');
    ladderEl.querySelectorAll('[data-scan-tol]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = parseFloat(btn.dataset.scanTol);
        document.getElementById('sym-tol').value = t;
        const symNew = analyzeSymmetry(t);
        renderSymmetryUI(symNew);
        logConsole(`symprec=${t} Å → ${symNew.estSG} (PG ${symNew.pg}, ${symNew.nOps} ops)`, 'accent');
      });
    });

    const tightSG = scanResults[0];
    const looseSG = scanResults[scanResults.length - 1];
    const brkBox = document.getElementById('sym-breaking-box');
    if (tightSG.sg !== looseSG.sg || tightSG.nOps !== looseSG.nOps) {
      brkBox.classList.remove('hidden');
      document.getElementById('sym-breaking-text').textContent =
        `${looseSG.sg} (${looseSG.nOps} ops, parent) → ${tightSG.sg} (${tightSG.nOps} ops, relaxed)`;
    } else {
      brkBox.classList.add('hidden');
    }

    const kp = KPATHS[sym.kpathKey] || KPATHS['Cubic-P'];
    document.getElementById('sym-kpath-str').textContent = kp.path;
    const kt = document.getElementById('sym-kpoints-table');
    kt.innerHTML = Object.entries(kp.pts).map(([k, v]) =>
      `<div class="flex justify-between"><span>${k === 'G' ? 'Γ (Gamma)' : k}</span><span>(${v.map(x=>x.toFixed(3)).join(', ')})</span></div>`
    ).join('');
  }

  function renderMagneticUI() {
    const s = state.structure;
    const listEl = document.getElementById('mag-atom-list');
    listEl.innerHTML = '';
    let netZ = 0;
    s.atoms.forEach((a, i) => {
      netZ += a.mag[2];
      const mLen = vNorm(a.mag);
      if (mLen < 0.01 && s.atoms.length > 24) return;
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-[var(--bg-hover)]';
      const colorCls = a.mag[2] > 0.05 ? 'text-rose-500 font-semibold' : (a.mag[2] < -0.05 ? 'text-sky-500 font-semibold' : 'text-mut');
      row.innerHTML = `
        <span>#${i+1} <b>${a.el}</b></span>
        <span class="${colorCls}">${state.magMode === 'noncollinear' ? a.mag.map(x=>x.toFixed(1)).join(',') : (a.mag[2]>=0?'+':'')+a.mag[2].toFixed(2)+' μB'}</span>
        <button class="v-btn py-0 px-1.5 text-[10px] flip-spin-btn" data-idx="${i}" title="Flip Spin">±</button>
      `;
      listEl.appendChild(row);
    });
    if (listEl.children.length === 0) {
      listEl.innerHTML = '<div class="text-mut text-center py-2">All moments are 0.0 μB; pick a preset above.</div>';
    }
    listEl.querySelectorAll('.flip-spin-btn').forEach(btn => btn.addEventListener('click', e => {
      const idx = Number(e.currentTarget.dataset.idx);
      pushHistory();
      const a = state.structure.atoms[idx];
      a.mag = a.mag.map(x => -x);
      renderMagneticUI();
      refreshVaspPreview();
      rebuildScene();
    }));

    document.getElementById('mag-total-net').textContent = `Net Mz: ${netZ.toFixed(2)} μB`;
    document.getElementById('magmom-output').value = generateMAGMOMString();
  }

  function renderAtomsTable() {
    const s = state.structure;
    const filter = (document.getElementById('atom-filter').value || '').trim().toLowerCase();
    const body = document.getElementById('atoms-table-body');
    body.innerHTML = '';
    s.atoms.forEach((a, i) => {
      if (filter && !a.el.toLowerCase().includes(filter) && !String(i+1).includes(filter)) return;
      const isSel = state.selectedAtomIndices.includes(i);
      const row = document.createElement('div');
      row.className = `flex items-center justify-between py-1 px-1 cursor-pointer ${isSel ? 'bg-[var(--bg-active)] font-semibold' : 'hover:bg-[var(--bg-hover)]'}`;
      row.innerHTML = `
        <span class="w-12">#${i+1} <b>${a.el}</b></span>
        <span class="flex-1 text-sub">${a.frac.map(x=>x.toFixed(3)).join(' ')}</span>
        <span class="text-[9.5px] px-1 rounded ${a.sel.every(Boolean) ? 'text-green-600' : 'text-amber-500'}">${a.sel.map(b=>b?'T':'F').join('')}</span>
      `;
      row.addEventListener('click', (e) => {
        if (e.shiftKey) {
          const pos = state.selectedAtomIndices.indexOf(i);
          if (pos >= 0) state.selectedAtomIndices.splice(pos, 1);
          else state.selectedAtomIndices.push(i);
        } else {
          state.selectedAtomIndices = [i];
        }
        syncSelectionUI();
        renderAtomsTable();
        rebuildScene();
      });
      body.appendChild(row);
    });
  }

  function refreshVaspPreview() {
    const label = document.getElementById('vasp-file-label');
    const ta = document.getElementById('vasp-file-preview');
    label.textContent = state.activeVaspFile;
    const S = window.Studio;
    if (state.activeVaspFile === 'POSCAR') ta.value = generatePOSCAR();
    else if (state.activeVaspFile === 'KPOINTS') ta.value = S ? S.getKpoints() : generateKPOINTS();
    else ta.value = S ? S.getIncar() : generateINCAR();
    notifyStudio();
  }

  function updateSupercellPreview() {
    const na = Math.max(1, parseInt(document.getElementById('sc-na').value,10) || 1);
    const nb = Math.max(1, parseInt(document.getElementById('sc-nb').value,10) || 1);
    const nc = Math.max(1, parseInt(document.getElementById('sc-nc').value,10) || 1);
    const mult = na * nb * nc;
    const nat = state.structure ? state.structure.atoms.length * mult : 0;
    document.getElementById('sc-preview-count').textContent = `×${mult} (${nat} atoms)`;
  }

  // =========================================================================
  // 10. SUPERCELL, MATRIX TRANSFORM & SLAB OPERATIONS
  // =========================================================================
  function applyTransformationMatrix(P) {
    const det = matDet3(P);
    if (Math.abs(det) < 1e-4) { showToast('Singular matrix: det(P) cannot be 0'); return; }
    if (Math.abs(det) > 64) { showToast('Transformation too large (|det(P)| > 64)'); return; }
    const invP = matInv3(P);
    if (!invP) return;

    pushHistory();
    const s = state.structure;
    const oldL = s.lattice;
    const newL = matMul3(P, oldL);

    // Find bounding box of new unit cell corners in old fractional coordinates
    const corners = [];
    for (let i=0;i<=1;i++) for (let j=0;j<=1;j++) for (let k=0;k<=1;k++) {
      corners.push([
        i*P[0][0] + j*P[1][0] + k*P[2][0],
        i*P[0][1] + j*P[1][1] + k*P[2][1],
        i*P[0][2] + j*P[1][2] + k*P[2][2]
      ]);
    }
    const mins = [0,1,2].map(d => Math.floor(Math.min(...corners.map(c => c[d]))) - 1);
    const maxs = [0,1,2].map(d => Math.ceil(Math.max(...corners.map(c => c[d]))) + 1);

    const newAtoms = [];
    for (const a of s.atoms) {
      for (let n0=mins[0]; n0<=maxs[0]; n0++) {
        for (let n1=mins[1]; n1<=maxs[1]; n1++) {
          for (let n2=mins[2]; n2<=maxs[2]; n2++) {
            const fOld = [a.frac[0]+n0, a.frac[1]+n1, a.frac[2]+n2];
            const fNew = [
              fOld[0]*invP[0][0] + fOld[1]*invP[1][0] + fOld[2]*invP[2][0],
              fOld[0]*invP[0][1] + fOld[1]*invP[1][1] + fOld[2]*invP[2][1],
              fOld[0]*invP[0][2] + fOld[1]*invP[1][2] + fOld[2]*invP[2][2]
            ];
            if (fNew[0] >= -1e-4 && fNew[0] < 1 - 1e-4 &&
                fNew[1] >= -1e-4 && fNew[1] < 1 - 1e-4 &&
                fNew[2] >= -1e-4 && fNew[2] < 1 - 1e-4) {
              const wrapped = fNew.map(wrap01);
              const dup = newAtoms.some(ex => pbcDist(ex.frac, wrapped, newL) < 0.08);
              if (!dup) {
                newAtoms.push({ el: a.el, frac: wrapped, mag: [...a.mag], sel: [...a.sel] });
              }
            }
          }
        }
      }
    }
    if (newAtoms.length === 0) { showToast('No atoms generated by matrix'); return; }
    s.lattice = newL;
    s.atoms = newAtoms;
    s.cifSG = null;
    state.selectedAtomIndices = [];
    state.measurements = [];
    logConsole(`Applied transformation (det=${det.toFixed(2)}) → ${newAtoms.length} atoms`, 'accent');
    showToast(`Transformed cell: ${newAtoms.length} atoms`);
    refreshAllUI(true);
    fitCameraToStructure();
  }

  // =========================================================================
  // 11. EVENT LISTENERS & WIRING
  // =========================================================================
  function setStyleMode(mode) {
    state.styleMode = mode;
    document.querySelectorAll('#style-mode-group button').forEach(b => {
      b.classList.toggle('v-btn-active', b.dataset.styleMode === mode);
    });
    rebuildScene();
  }

  function loadSample(key) {
    state.structure = cloneStructure(SAMPLES[key]);
    state.history = [];
    state.future = [];
    syncHistoryButtons();
    state.selectedAtomIndices = [];
    state.measurements = [];
    state.speciesConfig = {};
    refreshAllUI(true);
    setCameraViewDirection([1.1, 0.75, 1.35], [0, 0, 1]);
    fitCameraToStructure();
    logConsole(`Loaded ${state.structure.name} (${state.structure.atoms.length} atoms)`, 'accent');
  }

  // Header Controls
  document.getElementById('sample-select').addEventListener('change', e => {
    const v = e.target.value;
    if (v.startsWith('site:')) {
      const t = window.SiteBridge && window.SiteBridge.templates.find(x => 'site:' + x.id === v);
      if (t) { loadStructureText(t.poscar, 'POSCAR', t.label); setCameraViewDirection([1.1, 0.75, 1.35], [0, 0, 1]); fitCameraToStructure(); }
      return;
    }
    loadSample(v);
  });
  document.getElementById('btn-import-file').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        pushHistory();
        state.structure = autoParseStructure(String(reader.result), file.name);
        state.selectedAtomIndices = [];
        state.measurements = [];
        state.speciesConfig = {};
        refreshAllUI(true);
        fitCameraToStructure();
        logConsole(`Imported ${file.name} (${state.structure.atoms.length} atoms)`, 'accent');
        showToast(`Loaded ${file.name}`);
      } catch (err) {
        showToast(`Parse error: ${err.message}`);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  // Paste Modal
  const pasteModal = document.getElementById('paste-modal');
  const closePaste = () => { pasteModal.classList.add('hidden'); pasteModal.classList.remove('flex'); };
  document.getElementById('btn-paste-modal').addEventListener('click', () => {
    pasteModal.classList.remove('hidden'); pasteModal.classList.add('flex');
    document.getElementById('paste-textarea').focus();
  });
  document.getElementById('btn-close-paste').addEventListener('click', closePaste);
  document.getElementById('btn-cancel-paste').addEventListener('click', closePaste);
  document.getElementById('btn-load-paste').addEventListener('click', () => {
    const txt = document.getElementById('paste-textarea').value.trim();
    if (!txt) return;
    try {
      pushHistory();
      state.structure = autoParseStructure(txt, 'Pasted Structure');
      state.selectedAtomIndices = [];
      state.measurements = [];
      state.speciesConfig = {};
      refreshAllUI(true);
      fitCameraToStructure();
      closePaste();
      showToast(`Loaded ${state.structure.atoms.length} atoms`);
    } catch (err) {
      showToast(`Parse error: ${err.message}`);
    }
  });

  document.getElementById('btn-undo').addEventListener('click', () => { if (undoStep()) fitCameraToStructure(); });
  const redoBtn = document.getElementById('btn-redo');
  if (redoBtn) redoBtn.addEventListener('click', () => { if (redoStep()) fitCameraToStructure(); });

  // The site export gate (B-rule errors need a reason) wraps the download when the bridge is present.
  document.getElementById('btn-export-poscar').addEventListener('click', () => {
    if (window.StudioExportGate) window.StudioExportGate(generatePOSCAR(), (text) => downloadTextFile('POSCAR', text));
    else downloadTextFile('POSCAR', generatePOSCAR());
  });
  document.getElementById('btn-export-cif').addEventListener('click', () => downloadTextFile('structure.cif', generateCIF()));
  document.getElementById('btn-snapshot').addEventListener('click', () => {
    renderer.render(scene, activeCam);
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = `${(state.structure.name || 'vesta').replace(/[^a-z0-9]/gi,'_')}.png`;
    a.click();
    showToast('Saved PNG snapshot');
  });

  // Theme Toggle
  document.getElementById('btn-theme').addEventListener('click', () => {
    state.dark = !state.dark;
    document.documentElement.classList.toggle('dark', state.dark);
    const ic = document.getElementById('theme-icon');
    ic.setAttribute('data-lucide', state.dark ? 'sun' : 'moon');
    if (window.lucide) lucide.createIcons();
    rebuildScene();
    notifyStudio();
  });

  // Sidebar Toggles
  document.getElementById('btn-toggle-left').addEventListener('click', () => {
    document.getElementById('left-sidebar').classList.toggle('hidden');
    setTimeout(updateCameraTransform, 20);
  });
  document.getElementById('btn-toggle-right').addEventListener('click', (e) => {
    const rw = document.getElementById('right-workbench');
    rw.classList.toggle('hidden');
    e.currentTarget.classList.toggle('v-btn-active', !rw.classList.contains('hidden'));
    setTimeout(updateCameraTransform, 20);
  });
  document.getElementById('btn-toggle-console').addEventListener('click', () => {
    document.getElementById('console-panel').classList.toggle('hidden');
    setTimeout(updateCameraTransform, 20);
  });
  document.getElementById('btn-clear-console').addEventListener('click', () => {
    document.getElementById('console-log').innerHTML = '';
  });

  // Tool Strip
  const TOOL_HINTS = {
    rotate: 'Drag to rotate · Right-drag to pan · Scroll to zoom',
    select: 'Click an atom to inspect/select · Shift+Click for multiple',
    pan: 'Drag to pan/translate the view',
    zoom: 'Drag up/down or scroll to zoom',
    distance: 'Click 2 atoms to measure bond distance (Å)',
    angle: 'Click 3 atoms to measure bond angle (°)',
    dihedral: 'Click 4 atoms to measure dihedral angle (°)'
  };
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tool = btn.dataset.tool;
      state.measureQueue = [];
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('hud-tool-hint').textContent = TOOL_HINTS[state.tool];
    });
  });
  document.getElementById('btn-fit-tool').addEventListener('click', fitCameraToStructure);
  document.getElementById('btn-clear-meas').addEventListener('click', () => {
    state.measurements = [];
    state.measureQueue = [];
    state.selectedAtomIndices = [];
    syncSelectionUI();
    rebuildScene();
    showToast('Cleared measurements & selection');
  });

  // Left & Right Panel Tabs
  document.querySelectorAll('[data-left-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-left-tab]').forEach(b => b.classList.toggle('active', b === btn));
      ['style','objects','lattice'].forEach(t => {
        document.getElementById(`left-tab-${t}`).classList.toggle('hidden', t !== btn.dataset.leftTab);
      });
    });
  });
  document.querySelectorAll('[data-right-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-right-tab]').forEach(b => b.classList.toggle('active', b === btn));
      ['supercell','catalyst','symmetry','magnetic','atoms','vasp','checks'].forEach(t => {
        document.getElementById(`right-tab-${t}`).classList.toggle('hidden', t !== btn.dataset.rightTab);
      });
    });
  });

  // Style Controls
  document.querySelectorAll('#style-mode-group button').forEach(btn => {
    btn.addEventListener('click', () => setStyleMode(btn.dataset.styleMode));
  });
  document.getElementById('chk-unitcell').addEventListener('change', e => { state.showUnitCell = e.target.checked; rebuildScene(); });
  document.getElementById('chk-vectors').addEventListener('change', e => { state.showVectors = e.target.checked; rebuildScene(); });
  document.getElementById('chk-labels').addEventListener('change', e => { state.showLabels = e.target.checked; updateProjectedLabels(); });
  document.getElementById('chk-poly-edges').addEventListener('change', e => { state.showPolyEdges = e.target.checked; rebuildScene(); });
  document.getElementById('chk-ortho').addEventListener('change', e => { state.isOrtho = e.target.checked; updateCameraTransform(); });

  const bindRange = (id, valId, key) => {
    document.getElementById(id).addEventListener('input', e => {
      state[key] = parseFloat(e.target.value);
      document.getElementById(valId).textContent = state[key].toFixed(2);
      rebuildScene();
    });
  };
  bindRange('rng-atom-scale', 'val-atom-scale', 'atomScale');
  bindRange('rng-bond-rad', 'val-bond-rad', 'bondRadius');
  bindRange('rng-bond-cut', 'val-bond-cut', 'bondCutoff');
  bindRange('rng-poly-op', 'val-poly-op', 'polyOpacity');
  bindRange('rng-vec-scale', 'val-vec-scale', 'vecScale');

  // Boundary Controls
  document.getElementById('btn-apply-boundary').addEventListener('click', () => {
    state.boundary = {
      xmin: parseFloat(document.getElementById('bnd-xmin').value) || 0,
      xmax: parseFloat(document.getElementById('bnd-xmax').value) || 1,
      ymin: parseFloat(document.getElementById('bnd-ymin').value) || 0,
      ymax: parseFloat(document.getElementById('bnd-ymax').value) || 1,
      zmin: parseFloat(document.getElementById('bnd-zmin').value) || 0,
      zmax: parseFloat(document.getElementById('bnd-zmax').value) || 1
    };
    rebuildScene();
    showToast('Updated visual boundary');
  });
  document.getElementById('btn-reset-boundary').addEventListener('click', () => {
    ['xmin','ymin','zmin'].forEach(k => document.getElementById('bnd-'+k).value = '-0.05');
    ['xmax','ymax','zmax'].forEach(k => document.getElementById('bnd-'+k).value = '1.05');
    state.boundary = { xmin:-0.05, xmax:1.05, ymin:-0.05, ymax:1.05, zmin:-0.05, zmax:1.05 };
    rebuildScene();
  });

  // Orientation & Step Rotation Bar
  document.querySelectorAll('.orient-btn[data-axis]').forEach(btn => {
    btn.addEventListener('click', () => {
      const L = state.structure.lattice;
      const B = getReciprocalLattice(L);
      const ax = btn.dataset.axis;
      if (ax === 'a') setCameraViewDirection(L[0], L[2]);
      else if (ax === 'b') setCameraViewDirection(L[1], L[2]);
      else if (ax === 'c') setCameraViewDirection(L[2], L[1]);
      else if (ax === 'a*') setCameraViewDirection(B[0], L[2]);
      else if (ax === 'b*') setCameraViewDirection(B[1], L[2]);
      else if (ax === 'c*') setCameraViewDirection(B[2], L[1]);
      else setCameraViewDirection([1.1, 0.75, 1.35], [0, 0, 1]);
    });
  });
  document.querySelectorAll('.orient-btn[data-rot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const deg = parseFloat(document.getElementById('step-angle').value) || 90;
      const rad = deg * Math.PI / 180;
      const r = btn.dataset.rot;
      let axis = new THREE.Vector3(0,1,0), ang = rad;
      if (r === 'left') { axis.set(0,1,0); ang = rad; }
      else if (r === 'right') { axis.set(0,1,0); ang = -rad; }
      else if (r === 'up') { axis.set(1,0,0); ang = rad; }
      else if (r === 'down') { axis.set(1,0,0); ang = -rad; }
      else if (r === 'ccw') { axis.set(0,0,1); ang = rad; }
      else if (r === 'cw') { axis.set(0,0,1); ang = -rad; }
      const q = new THREE.Quaternion().setFromAxisAngle(axis, ang);
      camState.quat.multiply(q).normalize();
      updateCameraTransform();
    });
  });

  // Supercell & Matrix Controls
  ['sc-na','sc-nb','sc-nc'].forEach(id => document.getElementById(id).addEventListener('input', updateSupercellPreview));
  document.getElementById('btn-apply-supercell').addEventListener('click', () => {
    const na = Math.max(1, parseInt(document.getElementById('sc-na').value,10) || 1);
    const nb = Math.max(1, parseInt(document.getElementById('sc-nb').value,10) || 1);
    const nc = Math.max(1, parseInt(document.getElementById('sc-nc').value,10) || 1);
    applyTransformationMatrix([[na,0,0],[0,nb,0],[0,0,nc]]);
  });

  const readPMatrix = () => {
    const g = (id) => parseFloat(document.getElementById(id).value) || 0;
    return [[g('p00'), g('p01'), g('p02')], [g('p10'), g('p11'), g('p12')], [g('p20'), g('p21'), g('p22')]];
  };
  const pIds = ['p00','p01','p02','p10','p11','p12','p20','p21','p22'];
  const updatePDet = () => {
    document.getElementById('p-det-badge').textContent = `det(P) = ${matDet3(readPMatrix()).toFixed(2)}`;
  };
  pIds.forEach(id => document.getElementById(id).addEventListener('input', updatePDet));

  const P_PRESETS = {
    identity: [1,0,0, 0,1,0, 0,0,1],
    sqrt2:    [1,1,0, -1,1,0, 0,0,1],
    fcc2prim: [0,0.5,0.5, 0.5,0,0.5, 0.5,0.5,0],
    hex2ortho:[1,0,0, 1,2,0, 0,0,1]
  };
  document.querySelectorAll('[data-p-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const vals = P_PRESETS[btn.dataset.pPreset];
      pIds.forEach((id, i) => document.getElementById(id).value = vals[i]);
      updatePDet();
    });
  });
  document.getElementById('btn-apply-matrix').addEventListener('click', () => applyTransformationMatrix(readPMatrix()));

  // Vacuum & Selective Dynamics
  document.getElementById('btn-add-vacuum').addEventListener('click', () => {
    const ax = parseInt(document.getElementById('vac-axis').value, 10);
    const vac = parseFloat(document.getElementById('vac-amount').value) || 15;
    pushHistory();
    const s = state.structure;
    const carts = s.atoms.map(a => fracToCart(a.frac, s.lattice));
    const oldLen = vNorm(s.lattice[ax]);
    const scale = (oldLen + vac) / (oldLen || 1);
    s.lattice[ax] = vScale(s.lattice[ax], scale);
    s.atoms.forEach((a, i) => { a.frac = cartToFrac(carts[i], s.lattice).map(wrap01); });
    s.cifSG = null;
    logConsole(`Added ${vac} Å vacuum along ${['a','b','c'][ax]}`, 'accent');
    refreshAllUI(true);
    fitCameraToStructure();
  });

  document.getElementById('btn-center-c').addEventListener('click', () => {
    pushHistory();
    const zs = state.structure.atoms.map(a => a.frac[2]);
    const mid = (Math.min(...zs) + Math.max(...zs)) / 2;
    const shift = 0.5 - mid;
    state.structure.atoms.forEach(a => { a.frac[2] = wrap01(a.frac[2] + shift); });
    refreshAllUI(false);
    showToast('Centered atoms along c-axis');
  });

  document.getElementById('btn-wrap-atoms').addEventListener('click', () => {
    pushHistory();
    state.structure.atoms.forEach(a => { a.frac = a.frac.map(wrap01); });
    refreshAllUI(false);
    showToast('Wrapped fractional coordinates to [0, 1)');
  });

  document.getElementById('chk-seldyn').addEventListener('change', e => {
    state.structure.selectiveDynamics = e.target.checked;
    refreshVaspPreview();
  });

  document.getElementById('btn-apply-seldyn-z').addEventListener('click', () => {
    const zcut = parseFloat(document.getElementById('seldyn-zcut').value);
    pushHistory();
    state.structure.selectiveDynamics = true;
    let fixed = 0;
    state.structure.atoms.forEach(a => {
      const fix = a.frac[2] <= zcut;
      a.sel = [!fix, !fix, !fix];
      if (fix) fixed++;
    });
    refreshAllUI(false);
    showToast(`Fixed ${fixed} atoms with z ≤ ${zcut}`);
  });

  // Symmetry Controls
  document.getElementById('btn-run-symmetry').addEventListener('click', () => {
    const tol = parseFloat(document.getElementById('sym-tol').value) || 0.001;
    const sym = analyzeSymmetry(tol);
    renderSymmetryUI(sym);
    logConsole(`Symmetry: ${sym.system} | Centering: ${sym.centering} | PG: ${sym.pg} | ${sym.nOps} ops | ${sym.orbits.length} orbits`, 'accent');
    showToast(`Detected ${sym.system} (${sym.pg})`);
  });
  // Full CONTCAR Structural Report Modal
  const repModal = document.getElementById('contcar-report-modal');
  const closeRep = () => { repModal.classList.add('hidden'); repModal.classList.remove('flex'); };
  document.getElementById('btn-close-report').addEventListener('click', closeRep);
  repModal.addEventListener('click', e => { if (e.target === repModal) closeRep(); });

  document.querySelectorAll('[data-rep-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-rep-tab]').forEach(b => b.classList.toggle('active', b === btn));
      ['overview','econ','xrd','symops'].forEach(t => {
        document.getElementById(`rep-tab-${t}`).classList.toggle('hidden', t !== btn.dataset.repTab);
      });
    });
  });

  function populateContcarReportModal() {
    const s = state.structure;
    const p = getLatticeParams(s.lattice);
    const sym = state.symmetryResult || analyzeSymmetry();
    const spMap = getSpeciesOrder(s.atoms);
    const formula = Array.from(spMap.entries()).map(([el, list]) => `${el}${list.length > 1 ? list.length : ''}`).join('');
    const totalMass = s.atoms.reduce((sum, a) => sum + getElInfo(a.el).mass, 0);
    const density = p.vol > 1e-6 ? (totalMass / (p.vol * 0.602214076)) : 0;
    const atomVol = s.atoms.reduce((sum, a) => sum + (4/3)*Math.PI*Math.pow(getElInfo(a.el).r, 3), 0);
    const apf = p.vol > 1e-6 ? Math.min(100, (atomVol / p.vol) * 100) : 0;

    // Tab 1: Cell & Wyckoff
    document.getElementById('rep-tab-overview').innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="border border-subtle rounded p-2" style="background:var(--console-bg);"><div class="text-[9.5px] text-mut">Space Group</div><div class="font-mono-code font-bold text-blue-500">${sym.estSG}</div></div>
        <div class="border border-subtle rounded p-2" style="background:var(--console-bg);"><div class="text-[9.5px] text-mut">Formula / Atoms</div><div class="font-mono-code font-bold text-main">${formula} (${s.atoms.length})</div></div>
        <div class="border border-subtle rounded p-2" style="background:var(--console-bg);"><div class="text-[9.5px] text-mut">Volume / V per Atom</div><div class="font-mono-code font-bold text-main">${p.vol.toFixed(2)} Å³ (${(p.vol/s.atoms.length).toFixed(2)})</div></div>
        <div class="border border-subtle rounded p-2" style="background:var(--console-bg);"><div class="text-[9.5px] text-mut">Density · APF</div><div class="font-mono-code font-bold text-main">${density.toFixed(2)} g/cm³ · ${apf.toFixed(1)}%</div></div>
      </div>
      <div class="border border-subtle rounded p-2.5 font-mono-code text-[10.5px] grid grid-cols-3 gap-1.5">
        <span>a = ${p.a.toFixed(5)} Å</span><span>b = ${p.b.toFixed(5)} Å</span><span>c = ${p.c.toFixed(5)} Å</span>
        <span>α = ${p.alpha.toFixed(3)}°</span><span>β = ${p.beta.toFixed(3)}°</span><span>γ = ${p.gamma.toFixed(3)}°</span>
        <span>b/a = ${(p.b/(p.a||1)).toFixed(4)}</span><span>c/a = ${(p.c/(p.a||1)).toFixed(4)}</span><span>PG: ${sym.pg} (${sym.system})</span>
      </div>
      <div>
        <div class="font-bold text-main mb-1">Wyckoff Coordinates Table</div>
        <table class="w-full font-mono-code text-[10.5px] border-collapse">
          <thead><tr class="border-b border-theme text-left text-mut"><th class="py-1">Wyckoff</th><th>El</th><th>Site Sym</th><th>Fractional (x, y, z)</th><th>Cartesian (Å)</th></tr></thead>
          <tbody>
            ${sym.orbits.map(o => `
              <tr class="border-b border-subtle">
                <td class="py-1 font-bold text-blue-500">${o.wyckoff}</td>
                <td class="font-bold">${o.el}</td>
                <td>order ${o.siteSymOrder}</td>
                <td>(${o.repFrac.map(x=>x.toFixed(5)).join(', ')})</td>
                <td class="text-sub">(${o.repCart.map(x=>x.toFixed(3)).join(', ')})</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Tab 2: Hoppe ECoN, Baur Distortion & Pairwise Bonds
    const econRows = sym.orbits.map(o => ({ o, ec: computeSiteECoN(o.repIdx) }));
    const nnPairs = computePairwiseNNBonds();
    document.getElementById('rep-tab-econ').innerHTML = `
      <div>
        <div class="font-bold text-main mb-1">Hoppe ECoN, Bond Valence Sums (Brown–Altermatt, B = 0.37 Å) &amp; Distortion</div>
        <table class="w-full font-mono-code text-[10.5px] border-collapse">
          <thead><tr class="border-b border-theme text-left text-mut"><th class="py-1">Site</th><th>ECoN</th><th>CN</th><th>l_avg (Å)</th><th>Distortion D</th><th>V_poly (Å³)</th><th>BVS (v.u.)</th></tr></thead>
          <tbody>
            ${econRows.map(({ o, ec }) => `
              <tr class="border-b border-subtle">
                <td class="py-1 font-bold">${o.wyckoff}</td>
                <td class="font-bold text-blue-500">${ec.econ.toFixed(3)}</td>
                <td>${ec.cn}</td>
                <td>${ec.lAvg.toFixed(4)}</td>
                <td>${ec.distortion.toFixed(5)}</td>
                <td>${ec.polyVol > 0.01 ? ec.polyVol.toFixed(2) : '-'}</td>
                <td class="text-emerald-600 dark:text-emerald-400 font-semibold">${ec.bvs ? ec.bvs.map(b => `${b.label}:${b.val.toFixed(2)}`).join(', ') : '-'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div>
        <div class="font-bold text-main mb-1">Shortest Periodic Pair Distances</div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono-code text-[10.5px]">
          ${nnPairs.map(x => `<div class="border border-subtle rounded px-2 py-1 flex justify-between"><b>${x.pair}</b><span>${x.d.toFixed(4)} Å</span></div>`).join('')}
        </div>
      </div>
    `;

    // Tab 3: Simulated Powder XRD (Exact Cromer-Mann 9-param f0 + SVG Diffractogram)
    const xrd = computeSimulatedXRD(1.5406, 80);
    const svgW = 640, svgH = 150, padL = 36, padR = 14, padT = 16, padB = 24;
    const plotW = svgW - padL - padR, plotH = svgH - padT - padB;
    const xMap = (tt) => padL + ((tt - 5) / 75) * plotW;
    const yMap = (val) => padT + plotH * (1 - val / 105);
    // Smooth Lorentzian/Gaussian broadened profile
    const profPts = [];
    for (let tt = 5; tt <= 80; tt += 0.25) {
      let y = 0;
      for (const pk of xrd) {
        const dx = tt - pk.twoTheta;
        if (Math.abs(dx) < 3.0) y += pk.relI * Math.exp(-0.5 * Math.pow(dx / 0.22, 2));
      }
      profPts.push(`${xMap(tt).toFixed(1)},${yMap(Math.min(104, y)).toFixed(1)}`);
    }
    const topPeaks = [...xrd].sort((a,b) => b.relI - a.relI).slice(0, 6);
    const xrdSvg = `
      <svg viewBox="0 0 ${svgW} ${svgH}" class="w-full h-36 rounded border border-subtle" style="background:var(--console-bg);">
        <line x1="${padL}" y1="${padT+plotH}" x2="${svgW-padR}" y2="${padT+plotH}" stroke="currentColor" stroke-opacity="0.3" />
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+plotH}" stroke="currentColor" stroke-opacity="0.3" />
        ${[10,20,30,40,50,60,70,80].map(t => `<text x="${xMap(t)}" y="${svgH-6}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.6">${t}°</text>`).join('')}
        ${xrd.map(pk => `<line x1="${xMap(pk.twoTheta).toFixed(1)}" y1="${padT+plotH}" x2="${xMap(pk.twoTheta).toFixed(1)}" y2="${yMap(pk.relI).toFixed(1)}" stroke="#3b82f6" stroke-width="1.2" opacity="0.45" />`).join('')}
        <polyline fill="none" stroke="#2563eb" stroke-width="1.6" points="${profPts.join(' ')}" />
        ${topPeaks.map(pk => `<text x="${xMap(pk.twoTheta).toFixed(1)}" y="${Math.max(10, yMap(pk.relI)-4).toFixed(1)}" font-size="8.5" font-weight="600" text-anchor="middle" fill="#2563eb">(${pk.h}${pk.k}${pk.l})</text>`).join('')}
      </svg>`;
    document.getElementById('rep-tab-xrd').innerHTML = `
      <div class="text-sub mb-1">Exact 9-parameter <b>Cromer–Mann</b> X-ray form factors (Cu Kα, λ = 1.5406 Å, B<sub>iso</sub> = 0.5 Å², 2θ = 5°–80°):</div>
      ${xrdSvg}
      <table class="w-full font-mono-code text-[10.5px] border-collapse">
        <thead><tr class="border-b border-theme text-left text-mut"><th class="py-1">2θ (°)</th><th>d_hkl (Å)</th><th>(h k l)</th><th>Mult</th><th>Rel. Intensity</th></tr></thead>
        <tbody>
          ${xrd.map(pk => `
            <tr class="border-b border-subtle">
              <td class="py-1 font-bold text-main">${pk.twoTheta.toFixed(2)}°</td>
              <td>${pk.d.toFixed(4)}</td>
              <td class="text-blue-500 font-semibold">(${pk.h} ${pk.k} ${pk.l})</td>
              <td>${pk.mult}</td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="w-24 h-2 rounded bg-[var(--border-subtle)] overflow-hidden"><div class="h-full bg-blue-500" style="width:${pk.relI.toFixed(1)}%"></div></div>
                  <span>${pk.relI.toFixed(1)}%</span>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;

    // Tab 4: Symmetry Operations (Jones Faithful)
    document.getElementById('rep-tab-symops').innerHTML = `
      <div class="text-sub">Detected <b>${sym.nOps}</b> space-group operations (${sym.estSG}) in Jones faithful notation:</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-1 font-mono-code text-[10px]">
        ${(sym.jonesOps || []).map((op, i) => `<div class="border border-subtle rounded px-1.5 py-0.5"><span class="text-mut mr-1">${i+1}.</span>${op}</div>`).join('')}
      </div>
    `;
  }

  document.getElementById('btn-open-report').addEventListener('click', () => {
    populateContcarReportModal();
    repModal.classList.remove('hidden'); repModal.classList.add('flex');
  });
  document.getElementById('btn-copy-report-md').addEventListener('click', () => copyToClipboard(buildFullContcarReportText('md'), 'CONTCAR Report'));
  document.getElementById('btn-copy-report-latex').addEventListener('click', () => copyToClipboard(buildFullContcarReportText('latex'), 'LaTeX Table'));
  document.getElementById('btn-dl-report-txt').addEventListener('click', () => {
    const fn = `${(state.structure.name || 'contcar').replace(/[^a-z0-9]/gi,'_')}_report.txt`;
    downloadTextFile(fn, buildFullContcarReportText('md'));
  });

  document.getElementById('btn-send-kpath').addEventListener('click', () => {
    if (window.Studio) window.Studio.useBandPath();
    showToast('High-symmetry k-path sent to step 4 (KPOINTS)');
  });

  // Magnetic Controls
  const updateMagModeBtns = () => {
    const isCol = state.magMode === 'collinear';
    document.getElementById('btn-mag-col').className = `px-2 py-0.5 text-[10.5px] font-semibold cursor-pointer ${isCol ? 'bg-blue-600 text-white' : 'text-sub'}`;
    document.getElementById('btn-mag-ncol').className = `px-2 py-0.5 text-[10.5px] font-semibold cursor-pointer ${!isCol ? 'bg-blue-600 text-white' : 'text-sub'}`;
    renderMagneticUI();
    refreshVaspPreview();
  };
  document.getElementById('btn-mag-col').addEventListener('click', () => { state.magMode = 'collinear'; updateMagModeBtns(); });
  document.getElementById('btn-mag-ncol').addEventListener('click', () => { state.magMode = 'noncollinear'; updateMagModeBtns(); });

  document.getElementById('col-mag-up').addEventListener('input', e => { state.magUpColor = e.target.value; rebuildScene(); });
  document.getElementById('col-mag-dn').addEventListener('input', e => { state.magDnColor = e.target.value; rebuildScene(); });

  // Bind Vector Visual Tilt Slider & Theory Modal
  document.getElementById('rng-vec-tilt').addEventListener('input', e => {
    state.vecTiltDeg = parseInt(e.target.value, 10) || 0;
    document.getElementById('val-vec-tilt').textContent = `${state.vecTiltDeg}°`;
    rebuildScene();
  });

  const theoryModal = document.getElementById('afm-theory-modal');
  const closeTheory = () => { theoryModal.classList.add('hidden'); theoryModal.classList.remove('flex'); };
  document.getElementById('btn-afm-theory').addEventListener('click', () => {
    theoryModal.classList.remove('hidden'); theoryModal.classList.add('flex');
  });
  document.getElementById('btn-close-theory').addEventListener('click', closeTheory);
  theoryModal.addEventListener('click', e => { if (e.target === theoryModal) closeTheory(); });

  // Automatic PBC Nearest-Neighbor Graph Builder & Wollan–Koehler AFM Solver
  function getMagSiteIndices(s) {
    const mode = document.getElementById('mag-sublattice') ? document.getElementById('mag-sublattice').value : 'auto3d';
    const idxs = [];
    if (mode.startsWith('el:')) {
      const targetEl = mode.slice(3);
      s.atoms.forEach((a, i) => { if (a.el === targetEl) idxs.push(i); });
      return idxs;
    }
    if (mode === 'auto3d4f') {
      const hasMag = s.atoms.some(a => getElInfo(a.el).is3d || getElInfo(a.el).is4f);
      s.atoms.forEach((a, i) => { if (!hasMag || getElInfo(a.el).is3d || getElInfo(a.el).is4f) idxs.push(i); });
      return idxs;
    }
    const has3d = s.atoms.some(a => getElInfo(a.el).is3d);
    const has4f = s.atoms.some(a => getElInfo(a.el).is4f);
    s.atoms.forEach((a, i) => {
      if (has3d) { if (getElInfo(a.el).is3d) idxs.push(i); }
      else if (has4f) { if (getElInfo(a.el).is4f) idxs.push(i); }
      else idxs.push(i);
    });
    return idxs;
  }

  function buildMagNNGraph(s, magIdxs) {
    const L = s.lattice;
    const n = magIdxs.length;
    const pairs = [];
    let minD = Infinity;
    for (let u=0; u<n; u++) {
      const fu = s.atoms[magIdxs[u]].frac;
      for (let v=u; v<n; v++) {
        const fv = s.atoms[magIdxs[v]].frac;
        for (let ix=-1; ix<=1; ix++) for (let iy=-1; iy<=1; iy++) for (let iz=-1; iz<=1; iz++) {
          if (u === v && ix === 0 && iy === 0 && iz === 0) continue;
          const df = [fv[0]-fu[0]+ix, fv[1]-fu[1]+iy, fv[2]-fu[2]+iz];
          const dr = fracToCart(df, L);
          const d = vNorm(dr);
          if (d > 0.4) {
            if (d < minD) minD = d;
            pairs.push({ u, v, d, dr, isSelfImage: u === v });
          }
        }
      }
    }
    const tolD = minD * 1.14;
    const nnEdges = pairs.filter(p => p.d <= tolD);
    // Split into in-plane (ab, |dz| < 0.35*d) vs out-of-plane (along c)
    const inPlaneAdj = Array.from({ length: n }, () => new Set());
    const fullAdj = Array.from({ length: n }, () => new Set());
    let hasSelfInPlane = false, hasSelfOutPlane = false;
    nnEdges.forEach(e => {
      const isInPlane = Math.abs(e.dr[2]) < 0.35 * e.d;
      if (e.isSelfImage) {
        if (isInPlane) hasSelfInPlane = true; else hasSelfOutPlane = true;
      } else {
        fullAdj[e.u].add(e.v); fullAdj[e.v].add(e.u);
        if (isInPlane) { inPlaneAdj[e.u].add(e.v); inPlaneAdj[e.v].add(e.u); }
      }
    });
    return { minD: isFinite(minD) ? minD : 0, nnEdges, inPlaneAdj, fullAdj, hasSelfInPlane, hasSelfOutPlane };
  }

  function bfs2Color(adj, n) {
    const color = new Array(n).fill(0);
    let frustrated = false;
    for (let start=0; start<n; start++) {
      if (color[start] !== 0) continue;
      color[start] = 1;
      const queue = [start];
      while (queue.length > 0) {
        const u = queue.shift();
        for (const v of adj[u]) {
          if (color[v] === 0) { color[v] = -color[u]; queue.push(v); }
          else if (color[v] === color[u]) frustrated = true;
        }
      }
    }
    return { color, frustrated };
  }

  function evaluateNNCoupling(s, magIdxs, graph) {
    let inAnti = 0, inPara = 0, outAnti = 0, outPara = 0;
    graph.nnEdges.forEach(e => {
      const mu = s.atoms[magIdxs[e.u]].mag[2];
      const mv = s.atoms[magIdxs[e.v]].mag[2];
      const anti = mu * mv < -1e-4;
      const isInPlane = Math.abs(e.dr[2]) < 0.35 * e.d;
      if (isInPlane) { if (anti) inAnti++; else inPara++; }
      else { if (anti) outAnti++; else outPara++; }
    });
    return { inAnti, inPara, outAnti, outPara };
  }

  function applyAutoMagneticPreset(preset) {
    const s = state.structure;
    const magIdxs = getMagSiteIndices(s);
    const diagTitle = document.getElementById('afm-diag-title');
    const diagDnn = document.getElementById('afm-diag-dnn');
    const diagBody = document.getElementById('afm-diag-body');
    const scBtn = document.getElementById('btn-afm-auto-sc');
    scBtn.classList.add('hidden');
    state.pendingAutoSC = null;

    if (preset === 'clear') {
      pushHistory();
      s.atoms.forEach(a => a.mag = [0,0,0]);
      diagTitle.textContent = 'Cleared Moments';
      diagDnn.textContent = '-';
      diagBody.textContent = 'All atomic magnetic moments reset to 0.0 μB.';
      updateMagModeBtns();
      rebuildScene();
      showToast('Zeroed all magnetic moments');
      return;
    }

    const graph = buildMagNNGraph(s, magIdxs);
    const n = magIdxs.length;
    const mVal = Math.max(0.1, parseFloat(document.getElementById('mag-preset-val').value) || 3.0);
    const spins = new Array(n).fill(1);
    let note = '';
    let suggestSC = null;

    if (preset === 'fm') {
      state.magMode = 'collinear';
      spins.fill(1);
      note = 'All magnetic sites aligned parallel (+m).';
    } else if (preset === 'afm-a') {
      state.magMode = 'collinear';
      // Cluster sites into distinct z-layers
      const zVals = magIdxs.map((idx, k) => ({ k, z: wrap01(s.atoms[idx].frac[2]) })).sort((a,b) => a.z - b.z);
      const layers = [];
      zVals.forEach(item => {
        if (layers.length === 0 || Math.abs(item.z - layers[layers.length-1].z) > 0.05) {
          layers.push({ z: item.z, members: [item.k] });
        } else {
          layers[layers.length-1].members.push(item.k);
        }
      });
      if (layers.length < 2) {
        suggestSC = { P: [[1,0,0],[0,1,0],[0,0,2]], label: '1×1×2 Supercell + AFM-A', preset: 'afm-a' };
        note = 'Only 1 magnetic layer along c; expand 1×1×2 for layered AFM-A.';
      } else {
        layers.forEach((lay, li) => lay.members.forEach(k => spins[k] = (li % 2 === 0 ? 1 : -1)));
        note = `Clustered ${layers.length} basal z-layers: FM in-plane, AFM along c.`;
      }
    } else if (preset === 'afm-c') {
      state.magMode = 'collinear';
      if (graph.hasSelfInPlane || n < 2) {
        suggestSC = { P: [[2,0,0],[0,2,0],[0,0,1]], label: '2×2×1 Supercell + AFM-C', preset: 'afm-c' };
        note = 'Cell too small for in-plane AFM-C (atoms bond to own periodic image).';
      } else {
        // Group atoms by (x, y) column so c-stacked columns stay FM
        const cols = [];
        magIdxs.forEach((idx, k) => {
          const f = s.atoms[idx].frac;
          let found = cols.find(c => {
            const dx = Math.abs(f[0]-c.fx), dy = Math.abs(f[1]-c.fy);
            return Math.min(dx, 1-dx) < 0.05 && Math.min(dy, 1-dy) < 0.05;
          });
          if (!found) { found = { fx: f[0], fy: f[1], members: [] }; cols.push(found); }
          found.members.push(k);
        });
        if (cols.length < 2) {
          suggestSC = { P: [[2,0,0],[0,2,0],[0,0,1]], label: '2×2×1 Supercell + AFM-C', preset: 'afm-c' };
          note = 'Only 1 magnetic column in ab-plane; expand 2×2×1 for AFM-C.';
        } else {
          // Build column adjacency from inPlaneAdj
          const colOf = new Array(n).fill(0);
          cols.forEach((c, ci) => c.members.forEach(k => colOf[k] = ci));
          const colAdj = Array.from({ length: cols.length }, () => new Set());
          for (let u=0; u<n; u++) for (const v of graph.inPlaneAdj[u]) {
            if (colOf[u] !== colOf[v]) { colAdj[colOf[u]].add(colOf[v]); colAdj[colOf[v]].add(colOf[u]); }
          }
          const { color, frustrated } = bfs2Color(colAdj, cols.length);
          cols.forEach((c, ci) => c.members.forEach(k => spins[k] = color[ci]));
          note = frustrated
            ? `2D NN graph partially frustrated (${cols.length} columns colored, FM along c).`
            : `Solved 2D bipartite coloring across ${cols.length} columns (AFM ab, FM c).`;
        }
      }
    } else if (preset === 'afm-g') {
      state.magMode = 'collinear';
      if (graph.hasSelfInPlane || graph.hasSelfOutPlane || n < 2) {
        suggestSC = { P: [[2,0,0],[0,2,0],[0,0,2]], label: '2×2×2 Supercell + AFM-G', preset: 'afm-g' };
        note = 'Unit cell has self-image 1st-NN bonds; expand 2×2×2 for 3D AFM-G.';
      } else {
        const { color, frustrated } = bfs2Color(graph.fullAdj, n);
        for (let k=0; k<n; k++) spins[k] = color[k];
        note = frustrated
          ? '1st-NN sublattice is geometrically frustrated (e.g. FCC/triangular). Try AFM-II for rocksalt 2nd-NN superexchange!'
          : 'Solved exact 3D bipartite Néel coloring (100% 1st-NN antiparallel).';
      }
    } else if (preset === 'afm-ii') {
      state.magMode = 'collinear';
      // Type-II Rocksalt AFM: alternate {111} planes (f_x + f_y + f_z)
      const proj = magIdxs.map((idx, k) => {
        const f = s.atoms[idx].frac;
        return { k, p: f[0] + f[1] + f[2] };
      }).sort((a,b) => a.p - b.p);
      const planes = [];
      proj.forEach(item => {
        if (planes.length === 0 || Math.abs(item.p - planes[planes.length-1].p) > 0.06) {
          planes.push({ p: item.p, members: [item.k] });
        } else {
          planes[planes.length-1].members.push(item.k);
        }
      });
      if (planes.length < 2) {
        suggestSC = { P: [[2,0,0],[0,2,0],[0,0,2]], label: '2×2×2 Supercell + AFM-II', preset: 'afm-ii' };
        note = 'Need ≥2 {111} magnetic planes; expand 2×2×2 for AFM-II.';
      } else {
        planes.forEach((pl, pi) => pl.members.forEach(k => spins[k] = (pi % 2 === 0 ? 1 : -1)));
        note = `Assigned AFM-II across ${planes.length} {111} planes (180° 2nd-NN superexchange).`;
      }
    }

    pushHistory();
    const subMode = document.getElementById('mag-sublattice') ? document.getElementById('mag-sublattice').value : 'auto3d';
    // Only reset non-target atoms when applying to an automatic group; preserve other species when targeting one species!
    if (!subMode.startsWith('el:')) {
      s.atoms.forEach(a => a.mag = [0,0,0]);
    }
    if (preset === 'spiral') {
      state.magMode = 'noncollinear';
      magIdxs.forEach((idx, k) => {
        const ang = (k % 3) * (2 * Math.PI / 3);
        s.atoms[idx].mag = [mVal * Math.cos(ang), mVal * Math.sin(ang), 0];
      });
      note = 'Applied 120° non-collinear coplanar spin texture in xy-plane.';
    } else {
      magIdxs.forEach((idx, k) => { s.atoms[idx].mag = [0, 0, spins[k] * mVal]; });
    }

    const stats = evaluateNNCoupling(s, magIdxs, graph);
    const inTot = stats.inAnti + stats.inPara;
    const outTot = stats.outAnti + stats.outPara;
    diagTitle.textContent = `${preset.toUpperCase()} (${n} mag sites)`;
    diagDnn.textContent = `d_NN = ${graph.minD.toFixed(3)} Å`;
    diagBody.innerHTML = `
      <div>${note}</div>
      <div class="mt-1 text-main">In-plane NN: <b>${stats.inAnti}/${inTot}</b> ↑↓ · Out-of-plane NN: <b>${stats.outAnti}/${outTot}</b> ↑↓</div>
    `;
    if (suggestSC) {
      state.pendingAutoSC = suggestSC;
      scBtn.textContent = `Auto-Build ${suggestSC.label}`;
      scBtn.classList.remove('hidden');
    }

    updateMagModeBtns();
    rebuildScene();
    logConsole(`Auto-${preset.toUpperCase()}: d_NN=${graph.minD.toFixed(3)} Å | in-plane ${stats.inAnti}/${inTot} ↑↓, out-of-plane ${stats.outAnti}/${outTot} ↑↓`, 'accent');
    showToast(`Applied ${preset.toUpperCase()} magnetic order`);
  }

  document.querySelectorAll('[data-mag-preset]').forEach(btn => {
    btn.addEventListener('click', () => applyAutoMagneticPreset(btn.dataset.magPreset));
  });

  document.getElementById('btn-afm-auto-sc').addEventListener('click', () => {
    if (!state.pendingAutoSC) return;
    const { P, preset } = state.pendingAutoSC;
    applyTransformationMatrix(P);
    applyAutoMagneticPreset(preset);
  });

  document.getElementById('btn-assign-mag').addEventListener('click', () => {
    const target = document.getElementById('mag-target').value;
    const mx = parseFloat(document.getElementById('mag-mx').value) || 0;
    const my = parseFloat(document.getElementById('mag-my').value) || 0;
    const mz = parseFloat(document.getElementById('mag-mz').value) || 0;
    let idxs = [];
    if (target === 'selected') {
      if (state.selectedAtomIndices.length === 0) { showToast('Select atom(s) first or choose a species'); return; }
      idxs = [...state.selectedAtomIndices];
    } else if (target.startsWith('el:')) {
      const el = target.slice(3);
      state.structure.atoms.forEach((a, i) => { if (a.el === el) idxs.push(i); });
    }
    pushHistory();
    if (Math.abs(mx) > 1e-4 || Math.abs(my) > 1e-4) state.magMode = 'noncollinear';
    idxs.forEach(i => { state.structure.atoms[i].mag = [mx, my, mz]; });
    updateMagModeBtns();
    rebuildScene();
    showToast(`Updated magnetic vector on ${idxs.length} atom(s)`);
  });

  document.getElementById('btn-copy-magmom').addEventListener('click', () => {
    copyToClipboard(document.getElementById('magmom-output').value, 'MAGMOM');
  });

  // Atoms & Defect Editor
  document.getElementById('atom-filter').addEventListener('input', renderAtomsTable);
  document.getElementById('btn-substitute').addEventListener('click', () => {
    const raw = (document.getElementById('edit-el-input').value || '').trim();
    if (!raw || state.selectedAtomIndices.length === 0) { showToast('Select atom(s) and enter element symbol'); return; }
    const el = raw[0].toUpperCase() + raw.slice(1).toLowerCase();
    pushHistory();
    state.selectedAtomIndices.forEach(i => { state.structure.atoms[i].el = el; });
    state.structure.cifSG = null;
    refreshAllUI(true);
    showToast(`Substituted ${state.selectedAtomIndices.length} atom(s) → ${el}`);
  });

  document.getElementById('btn-delete-selected').addEventListener('click', () => {
    if (state.selectedAtomIndices.length === 0) { showToast('Select atom(s) to delete'); return; }
    if (state.structure.atoms.length - state.selectedAtomIndices.length < 1) { showToast('Cannot delete all atoms'); return; }
    pushHistory();
    const delSet = new Set(state.selectedAtomIndices);
    state.structure.atoms = state.structure.atoms.filter((_, i) => !delSet.has(i));
    state.selectedAtomIndices = [];
    state.structure.cifSG = null;
    refreshAllUI(true);
    showToast(`Created vacancy (deleted ${delSet.size} atom(s))`);
  });

  document.getElementById('btn-add-atom').addEventListener('click', () => {
    const raw = (document.getElementById('add-el').value || '').trim();
    if (!raw) return;
    const el = raw[0].toUpperCase() + raw.slice(1).toLowerCase();
    const fx = wrap01(parseFloat(document.getElementById('add-fx').value) || 0);
    const fy = wrap01(parseFloat(document.getElementById('add-fy').value) || 0);
    const fz = wrap01(parseFloat(document.getElementById('add-fz').value) || 0);
    pushHistory();
    state.structure.atoms.push({ el, frac:[fx,fy,fz], mag:[0,0,0], sel:[true,true,true] });
    state.structure.cifSG = null;
    refreshAllUI(true);
    showToast(`Added ${el} at (${fx.toFixed(2)}, ${fy.toFixed(2)}, ${fz.toFixed(2)})`);
  });

  document.getElementById('btn-sort-species').addEventListener('click', () => {
    pushHistory();
    const spMap = getSpeciesOrder(state.structure.atoms);
    const sorted = [];
    for (const list of spMap.values()) {
      list.forEach(a => sorted.push({ el:a.el, frac:a.frac, mag:a.mag, sel:a.sel }));
    }
    state.structure.atoms = sorted;
    state.selectedAtomIndices = [];
    refreshAllUI(false);
    showToast('Sorted atoms by species for VASP POTCAR');
  });

  // VASP Files Tab Controls
  document.querySelectorAll('[data-vasp-file]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeVaspFile = btn.dataset.vaspFile;
      document.querySelectorAll('[data-vasp-file]').forEach(b => b.classList.toggle('v-btn-active', b === btn));
      ['POSCAR','KPOINTS','INCAR'].forEach(f => {
        document.getElementById(`vasp-opt-${f}`).classList.toggle('hidden', f !== state.activeVaspFile);
      });
      refreshVaspPreview();
    });
  });

  document.getElementById('poscar-coord-mode').addEventListener('change', e => { state.poscarCoord = e.target.value; refreshVaspPreview(); });
  document.getElementById('btn-copy-vasp').addEventListener('click', () => {
    copyToClipboard(document.getElementById('vasp-file-preview').value, state.activeVaspFile);
  });
  document.getElementById('btn-download-vasp').addEventListener('click', () => {
    downloadTextFile(state.activeVaspFile, document.getElementById('vasp-file-preview').value);
  });

  // =========================================================================
  // 11B. FLOATING SELECTION HUD, KEYBOARD DELETE & CATALYSIS / SLAB / HETERO
  // =========================================================================
  document.getElementById('hud-btn-del').addEventListener('click', () => {
    document.getElementById('btn-delete-selected').click();
  });
  document.getElementById('hud-btn-tf').addEventListener('click', () => {
    if (state.selectedAtomIndices.length === 0) return;
    pushHistory();
    state.structure.selectiveDynamics = true;
    state.selectedAtomIndices.forEach(i => {
      const a = state.structure.atoms[i];
      const next = !a.sel.every(Boolean);
      a.sel = [next, next, next];
    });
    refreshAllUI(false);
    showToast(`Toggled T/F on ${state.selectedAtomIndices.length} atom(s)`);
  });
  document.getElementById('hud-btn-adsorb').addEventListener('click', () => {
    document.getElementById('right-workbench').classList.remove('hidden');
    document.querySelector('[data-right-tab="catalyst"]').click();
  });
  document.getElementById('hud-btn-clear').addEventListener('click', () => {
    state.selectedAtomIndices = [];
    syncSelectionUI();
    rebuildScene();
  });

  // Delete / Backspace keyboard shortcut when atoms are selected (not typing in an input)
  window.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redoStep(); else undoStep(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redoStep(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedAtomIndices.length > 0) {
      e.preventDefault();
      document.getElementById('btn-delete-selected').click();
    } else if (e.key === 'Escape') {
      state.measureQueue = [];
      state.selectedAtomIndices = [];
      syncSelectionUI();
      rebuildScene();
    }
  });

  // 1. Surface Slab Cleave & Vacuum Builder
  const FACET_MATRICES = {
    '001': [[1,0,0],[0,1,0],[0,0,1]],
    '010': [[1,0,0],[0,0,1],[0,1,0]],
    '100': [[0,1,0],[0,0,1],[1,0,0]],
    '110': [[1,-1,0],[0,0,1],[1,1,0]],
    '111': [[1,-1,0],[0,1,-1],[1,1,1]]
  };

  document.getElementById('btn-build-slab').addEventListener('click', () => {
    const facet = document.getElementById('cat-facet').value;
    const layers = Math.max(1, Math.min(4, parseInt(document.getElementById('cat-layers').value, 10) || 2));
    const vac = Math.max(6, parseFloat(document.getElementById('cat-vac').value) || 15);
    const fixBot = document.getElementById('cat-fix-bottom').checked;

    const baseP = FACET_MATRICES[facet] || FACET_MATRICES['001'];
    const P = [baseP[0], baseP[1], baseP[2].map(x => x * layers)];
    applyTransformationMatrix(P);

    // Add vacuum along c, keep slab anchored near bottom (z_min ≈ 0.08) for adsorbates on top
    const s = state.structure;
    const carts = s.atoms.map(a => fracToCart(a.frac, s.lattice));
    const cLen = vNorm(s.lattice[2]);
    const cUnit = vUnit(s.lattice[2]);
    const zProjs = carts.map(r => vDot(r, cUnit));
    const zMin = Math.min(...zProjs), zMax = Math.max(...zProjs);
    const slabThick = Math.max(1.5, zMax - zMin);
    const newCLen = slabThick + vac;
    s.lattice[2] = vScale(cUnit, newCLen);

    // Shift slab so bottom sits at 1.5 Å above z=0 (leaving clean vacuum above)
    const zShift = 1.5 - zMin;
    s.atoms.forEach((a, i) => {
      const shiftedCart = vAdd(carts[i], vScale(cUnit, zShift));
      a.frac = cartToFrac(shiftedCart, s.lattice).map(wrap01);
      if (fixBot) {
        const relZ = (zProjs[i] - zMin) / slabThick;
        const free = relZ > 0.48;
        a.sel = [free, free, free];
      }
    });
    if (fixBot) s.selectiveDynamics = true;
    s.name = `${s.name.split(' ')[0]} (${facet}) Slab + ${vac}Å Vac`;
    refreshAllUI(true);
    fitCameraToStructure();
    logConsole(`Built (${facet}) catalyst slab: ${layers}×c + ${vac} Å vacuum (${s.atoms.length} atoms, bottom 50% fixed=${fixBot})`, 'accent');
    showToast(`Built (${facet}) catalyst slab with ${vac} Å vacuum`);
  });

  // 2. HER / OER / CO2RR Adsorbate Placer
  document.querySelectorAll('[data-adsorbate]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ads = btn.dataset.adsorbate;
      const s = state.structure;
      const h = parseFloat(document.getElementById('cat-ads-h').value) || 1.85;
      const azRad = (parseFloat(document.getElementById('cat-ads-az').value) || 45) * Math.PI / 180;
      const cUnit = vUnit(s.lattice[2]);
      const aUnit = vUnit(s.lattice[0]);
      // Orthonormal tangent vectors u, v perpendicular to surface normal cUnit
      const uVec = vUnit(vSub(aUnit, vScale(cUnit, vDot(aUnit, cUnit))));
      const vVec = vUnit(vCross(cUnit, uVec));
      const tDir = vAdd(vScale(uVec, Math.cos(azRad)), vScale(vVec, Math.sin(azRad)));

      // Determine binding anchor in Cartesian coordinates
      let anchorCart = null;
      let siteDesc = '';
      if (state.selectedAtomIndices.length > 0) {
        const selCarts = state.selectedAtomIndices.map(i => fracToCart(s.atoms[i].frac, s.lattice));
        anchorCart = selCarts.reduce((acc, p) => vAdd(acc, p), [0,0,0]).map(x => x / selCarts.length);
        siteDesc = state.selectedAtomIndices.length === 1
          ? `Top(${s.atoms[state.selectedAtomIndices[0]].el}${state.selectedAtomIndices[0]+1})`
          : (state.selectedAtomIndices.length === 2 ? 'Bridge' : 'Hollow');
      } else {
        // Auto-select highest-z metal atom (or highest-z atom)
        let bestIdx = 0, bestZ = -Infinity;
        const hasMetal = s.atoms.some(a => !ANION_SET.has(a.el));
        s.atoms.forEach((a, i) => {
          if (hasMetal && ANION_SET.has(a.el)) return;
          const z = vDot(fracToCart(a.frac, s.lattice), cUnit);
          if (z > bestZ) { bestZ = z; bestIdx = i; }
        });
        anchorCart = fracToCart(s.atoms[bestIdx].frac, s.lattice);
        siteDesc = `Auto Top(${s.atoms[bestIdx].el}${bestIdx+1})`;
      }

      // Build adsorbate atoms relative to anchorCart + h*cUnit
      const basePos = vAdd(anchorCart, vScale(cUnit, ads === 'H' ? Math.min(h, 1.60) : (ads === 'O' ? Math.min(h, 1.72) : h)));
      const toAdd = [];
      if (ads === 'H') {
        toAdd.push({ el:'H', cart: basePos });
      } else if (ads === 'O') {
        toAdd.push({ el:'O', cart: basePos });
      } else if (ads === 'OH') {
        const oPos = basePos;
        const hPos = vAdd(oPos, vAdd(vScale(cUnit, 0.97 * Math.cos(0.45)), vScale(tDir, 0.97 * Math.sin(0.45))));
        toAdd.push({ el:'O', cart: oPos }, { el:'H', cart: hPos });
      } else if (ads === 'OOH') {
        const o1 = basePos;
        const o2 = vAdd(o1, vAdd(vScale(cUnit, 1.44 * Math.cos(1.12)), vScale(tDir, 1.44 * Math.sin(1.12))));
        const h1 = vAdd(o2, vAdd(vScale(cUnit, 0.97 * Math.cos(0.65)), vScale(tDir, -0.97 * Math.sin(0.65))));
        toAdd.push({ el:'O', cart: o1 }, { el:'O', cart: o2 }, { el:'H', cart: h1 });
      } else if (ads === 'CO') {
        toAdd.push({ el:'C', cart: basePos }, { el:'O', cart: vAdd(basePos, vScale(cUnit, 1.15)) });
      } else if (ads === 'H2O') {
        const oPos = vAdd(anchorCart, vScale(cUnit, Math.max(h, 2.10)));
        const h1 = vAdd(oPos, vAdd(vScale(cUnit, 0.96 * Math.cos(0.91)), vScale(tDir, 0.96 * Math.sin(0.91))));
        const h2 = vAdd(oPos, vAdd(vScale(cUnit, 0.96 * Math.cos(0.91)), vScale(tDir, -0.96 * Math.sin(0.91))));
        toAdd.push({ el:'O', cart: oPos }, { el:'H', cart: h1 }, { el:'H', cart: h2 });
      } else if (ads === 'N2') {
        toAdd.push({ el:'N', cart: basePos }, { el:'N', cart: vAdd(basePos, vScale(cUnit, 1.10)) });
      }

      pushHistory();
      const newIdxs = [];
      toAdd.forEach(item => {
        s.atoms.push({ el: item.el, frac: cartToFrac(item.cart, s.lattice).map(wrap01), mag:[0,0,0], sel:[true,true,true] });
        newIdxs.push(s.atoms.length - 1);
      });
      s.cifSG = null;
      state.selectedAtomIndices = newIdxs;
      refreshAllUI(false);
      logConsole(`Placed *${ads} adsorbate on ${siteDesc} (h=${h.toFixed(2)} Å, ${toAdd.length} atoms added with T T T)`, 'accent');
      showToast(`Placed *${ads} on ${siteDesc}`);
    });
  });

  // 3. Heterostructure / Interface Stacker
  const OVERLAYERS = {
    graphene: {
      name: 'Graphene',
      lattice: [[2.46,0,0],[-1.23,2.1304,0],[0,0,10]],
      atoms: [
        { el:'C', frac:[0.33333,0.66667,0.5] },
        { el:'C', frac:[0.66667,0.33333,0.5] }
      ]
    },
    mos2: {
      name: 'MoS2',
      lattice: [[3.16,0,0],[-1.58,2.7366,0],[0,0,12]],
      atoms: [
        { el:'Mo', frac:[0.33333,0.66667,0.50] },
        { el:'S',  frac:[0.66667,0.33333,0.37] },
        { el:'S',  frac:[0.66667,0.33333,0.63] }
      ]
    },
    nio_layer: {
      name: 'NiO(001)',
      lattice: [[4.177,0,0],[0,4.177,0],[0,0,10]],
      atoms: [
        { el:'Ni', frac:[0,0,0.5] }, { el:'Ni', frac:[0.5,0.5,0.5] },
        { el:'O',  frac:[0.5,0,0.5] }, { el:'O',  frac:[0,0.5,0.5] }
      ]
    },
    pt111: {
      name: 'Pt(111)',
      lattice: [[2.77,0,0],[-1.385,2.3989,0],[0,0,10]],
      atoms: [{ el:'Pt', frac:[0,0,0.5] }]
    }
  };

  document.getElementById('het-top-layer').addEventListener('change', e => {
    document.getElementById('het-custom-poscar').classList.toggle('hidden', e.target.value !== 'custom');
  });

  document.getElementById('btn-build-hetero').addEventListener('click', () => {
    const choice = document.getElementById('het-top-layer').value;
    const dInt = parseFloat(document.getElementById('het-dint').value) || 3.0;
    const topVac = parseFloat(document.getElementById('het-vac').value) || 15;
    let topStruct = null;
    try {
      if (choice === 'custom') {
        const txt = document.getElementById('het-custom-poscar').value.trim();
        if (!txt) { showToast('Paste a 2nd POSCAR for custom heterostructure'); return; }
        topStruct = autoParseStructure(txt, 'CustomTop');
      } else {
        topStruct = OVERLAYERS[choice];
      }
    } catch (err) {
      showToast(`Top layer parse error: ${err.message}`);
      return;
    }

    pushHistory();
    const s = state.structure;
    const pSub = getLatticeParams(s.lattice);
    const pTop = getLatticeParams(topStruct.lattice);
    const misA = ((pTop.a - pSub.a) / (pSub.a || 1)) * 100;
    const misB = ((pTop.b - pSub.b) / (pSub.b || 1)) * 100;
    document.getElementById('het-mismatch-badge').textContent = `εa=${misA.toFixed(1)}%, εb=${misB.toFixed(1)}%`;

    const cUnit = vUnit(s.lattice[2]);
    const subCarts = s.atoms.map(a => fracToCart(a.frac, s.lattice));
    const subZs = subCarts.map(r => vDot(r, cUnit));
    const subZMin = Math.min(...subZs), subZMax = Math.max(...subZs);
    const subThick = Math.max(0.5, subZMax - subZMin);

    // Top layer internal z-offsets in Å
    const topCUnit = vUnit(topStruct.lattice[2]);
    const topCarts = topStruct.atoms.map(a => fracToCart(a.frac, topStruct.lattice));
    const topZs = topCarts.map(r => vDot(r, topCUnit));
    const topZMin = Math.min(...topZs), topZMax = Math.max(...topZs);
    const topThick = Math.max(0.2, topZMax - topZMin);

    const newCLen = 1.5 + subThick + dInt + topThick + topVac;
    s.lattice[2] = vScale(cUnit, newCLen);

    // Reposition substrate atoms (fix bottom half, relax top)
    s.atoms.forEach((a, i) => {
      const zShift = 1.5 - subZMin;
      const nc = vAdd(subCarts[i], vScale(cUnit, zShift));
      a.frac = cartToFrac(nc, s.lattice).map(wrap01);
      const isBot = (subZs[i] - subZMin) <= subThick * 0.5;
      a.sel = [!isBot, !isBot, !isBot];
    });

    // Stack top overlayer atoms matched to substrate in-plane lattice
    const topBaseZ = 1.5 + subThick + dInt;
    topStruct.atoms.forEach((ta, i) => {
      const relZ = topZs[i] - topZMin;
      const fz = (topBaseZ + relZ) / newCLen;
      s.atoms.push({
        el: ta.el,
        frac: [wrap01(ta.frac[0]), wrap01(ta.frac[1]), wrap01(fz)],
        mag: [0, 0, 0],
        sel: [true, true, true]
      });
    });

    s.selectiveDynamics = true;
    s.cifSG = null;
    s.name = `${s.name.split(' ')[0]} / ${topStruct.name} Heterostructure`;
    refreshAllUI(true);
    fitCameraToStructure();
    logConsole(`Stacked ${topStruct.name} heterostructure (d_int=${dInt} Å, vac=${topVac} Å, mismatch εa=${misA.toFixed(1)}%, εb=${misB.toFixed(1)}%)`, 'accent');
    showToast(`Built ${topStruct.name} heterostructure`);
  });

  // Resize Handler
  window.addEventListener('resize', updateCameraTransform);
  // The panel around the viewer can change size without a window resize (layout settling, embedded frame,
  // side panels, phone layout); keep the drawing buffer matched to the container.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => updateCameraTransform()).observe(container);

  // =========================================================================
  // 11C. BRIDGE: shared structure API used by the workflow steps (studio.js)
  // =========================================================================
  const studioListeners = [];
  let notifyTimer = null;
  function notifyStudio() {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => studioListeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }), 30);
  }
  function loadStructureText(text, name, displayName) {
    pushHistory();
    state.structure = autoParseStructure(text, name);
    if (displayName) state.structure.name = displayName;
    state.selectedAtomIndices = [];
    state.measurements = [];
    state.speciesConfig = {};
    refreshAllUI(true);
    fitCameraToStructure();
    logConsole(`Loaded ${name} (${state.structure.atoms.length} atoms)`, 'accent');
    showToast(`Loaded ${name}`);
  }
  window.VESTA = {
    onChange: fn => studioListeners.push(fn),
    getStructure: () => state.structure,
    getSpecies: () => {
      const m = getSpeciesOrder(state.structure.atoms);
      return Array.from(m.keys()).map(el => ({ el, count: m.get(el).length }));
    },
    getPOSCAR: generatePOSCAR,
    getCIF: generateCIF,
    getMAGMOM: generateMAGMOMString,
    getMagMode: () => state.magMode,
    hasMagnetism: () => state.structure.atoms.some(a => vNorm(a.mag) > 1e-3),
    isSelective: () => !!state.structure.selectiveDynamics,
    getLatticeParams: () => getLatticeParams(state.structure.lattice),
    getReciprocal: () => getReciprocalLattice(state.structure.lattice),
    getSymmetry: () => state.symmetryResult,
    getElementInfo: el => getElInfo(el),
    bandPathKPOINTS: nseg => { const m = state.kptsMode, n = state.kptsNseg; state.kptsMode = 'Line-mode'; state.kptsNseg = nseg; const t = generateKPOINTS(); state.kptsMode = m; state.kptsNseg = n; return t; },
    bandPathLabel: () => { const k = state.symmetryResult ? state.symmetryResult.kpathKey : 'Cubic-P'; const kp = KPATHS[k] || KPATHS['Cubic-P']; return { key: k, path: kp.segments.map(([x, y]) => x + '-' + y).join(' | ') }; },
    loadText: loadStructureText,
    // Replace the structure with edited POSCAR text (site checks and operations). Undo-able; keeps the
    // species colours, and keeps the moments when the atom count is unchanged.
    applyPOSCAR: (text, note) => {
      const prev = state.structure;
      pushHistory();
      const next = autoParseStructure(text, 'POSCAR');
      next.name = prev.name;
      const order = poscarOrder(prev.atoms);
      if (next.atoms.length === prev.atoms.length) next.atoms.forEach((a, i) => { a.mag = prev.atoms[order[i]].mag.slice(); });
      state.structure = next;
      state.selectedAtomIndices = [];
      refreshAllUI(true);
      if (note) logConsole(note, 'accent');
    },
    setMomentsByIndex: (vals) => {
      if (!Array.isArray(vals) || vals.length !== state.structure.atoms.length) return false;
      state.magMode = 'collinear';
      state.structure.atoms.forEach((a, i) => { a.mag = [0, 0, Number(vals[i]) || 0]; });
      refreshAllUI(false);
      return true;
    },
    poscarToAtomIndex: (idxs) => { const o = poscarOrder(state.structure.atoms); return idxs.map(i => o[i]).filter(i => i !== undefined); },
    selectAtoms: (idxs) => { state.selectedAtomIndices = idxs.slice(); syncSelectionUI(); rebuildScene(); },
    undo: undoStep,
    redo: redoStep,
    loadSampleKey: loadSample,
    setMomentsByElement: (map) => {
      pushHistory();
      state.magMode = 'collinear';
      state.structure.atoms.forEach(a => { a.mag = [0, 0, map[a.el] || 0]; });
      refreshAllUI(false);
    },
    openRightTab: t => { const b = document.querySelector(`[data-right-tab="${t}"]`); if (b) b.click(); },
    toast: showToast,
    log: logConsole,
    resize: () => setTimeout(updateCameraTransform, 30),
    isDark: () => state.dark,
    refresh: () => refreshVaspPreview()
  };

  // =========================================================================
  // 12. INITIALIZE APP
  // =========================================================================
  if (window.lucide) lucide.createIcons();
  if (window.innerWidth < 1024) {
    document.getElementById('left-sidebar').classList.add('hidden');
    document.getElementById('right-workbench').classList.add('hidden');
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    state.dark = true;
    document.documentElement.classList.add('dark');
    document.getElementById('theme-icon').setAttribute('data-lucide', 'sun');
    if (window.lucide) lucide.createIcons();
  }
  loadSample('nio_afm');
  if (animId) cancelAnimationFrame(animId);
  animate();
})();
