# The detailed rider's source (ADR-94): a MakeHuman character built in Blender
# with MPFB, joined into one mesh with one texture atlas, and exported as
# rider-source.glb next to this file. npm run assets fits it to the game's
# 19-bone rider (src/sim/body.ts) and builds public/models/rider-high.glb.
#
# Needs Blender 4.4, the MPFB 2.0.18 extension and the MakeHuman system assets
# pack (CC0), installed as README.md here says. Run from the repo root:
#   blender -b --python assets/source/models/rider/make_rider.py
# The result is the same on every run (the buzz cut's stubble grain is seeded).
import json
import math
import os

import bmesh
import bpy
import numpy as np
from bl_ext.user_default.mpfb.services import HumanService

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "rider-source.glb")
ATLAS_SIDE = 2048

# Look A, chosen by the owner on 2026-11-13.
HUMAN = {
    "phenotype": {
        "gender": 1.0, "age": 0.5, "muscle": 0.55, "weight": 0.45, "proportions": 0.6, "height": 0.8,
        "cupsize": 0.5, "firmness": 0.5, "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
    },
    "rig": "game_engine",
    "eyes": "low-poly/low-poly.mhclo",
    "eyebrows": "eyebrow001/eyebrow001.mhclo",
    "eyelashes": "eyelashes01/eyelashes01.mhclo",
    "tongue": "", "teeth": "", "proxy": "",
    "hair": "short02/short02.mhclo",
    "targets": [],
    "clothes": ["male_casualsuit06/male_casualsuit06.mhclo"],
    "skin_mhmat": "young_caucasian_male/young_caucasian_male.mhmat",
    "skin_material_type": "GAMEENGINE",
    "eyes_material_type": "MAKESKIN",
    "skin_material_settings": {}, "eyes_material_settings": {}, "expressions": [],
}

# Regions, written into the vertex colour's red channel as region / 10, so the
# game can tint the shirt and the beanie per rider (riderSpec.ts).
SKIN, SHIRT, JEANS, HAIR, BEANIE, EYES, BROWS, SOCK = 0, 1, 2, 3, 4, 5, 6, 7

# Where each part's texture goes in the atlas, in pixels: x, y (from the top), side.
# 2026-11-13 (ADR-101): the suit no longer shares one 1024 square; its jeans take a 2048 x 1024 strip across the
# bottom (SUIT_RECTS), about twice the pixels across and 1.7 times down, and the shirt a 1024 x 512 one at the top
# right, over the small tiles. The hair tile is gone (no hair cards since ADR-99). The body keeps its square.
RECTS = {
    "body": (0, 0, 1024),
    "eyes": (1024, 512, 256),
    "brows": (1280, 512, 256),
    "lashes": (1536, 512, 256),
    "beanie": (1792, 512, 256),
}
# The suit's two parts, each its own band of the suit's picture (from the top, as fractions of its height; the shirt
# is the top 42 percent, SUIT_SPLIT in V) in its own rectangle: x, y, width, height.
SUIT_SPLIT = 0.58
SUIT_RECTS = {
    "shirt": ((1024, 0, 1024, 512), 0.0, 1 - SUIT_SPLIT),
    "jeans": ((0, 1024, 2048, 1024), 1 - SUIT_SPLIT, 1.0),
}
PAD = 4  # pixels kept clear inside each rect, so mipmaps do not bleed between parts


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def image_pixels(img, side):
    """An image's pixels as a side x side x 4 float array, top row first."""
    img = img.copy()
    img.scale(side, side)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(side, side, 4)
    bpy.data.images.remove(img)
    return px[::-1].copy()


def diffuse_of(obj):
    for n in obj.data.materials[0].node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and "_ao" not in n.image.filepath and "_normal" not in n.image.filepath:
            return n.image
    raise RuntimeError("no diffuse texture on " + obj.name)


def keep_only(obj, keep):
    """Deletes the vertices of obj for which keep(index) is False."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    gone = [v for v in bm.verts if not keep(v.index)]
    bmesh.ops.delete(bm, geom=gone, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def group_weight(obj, names):
    """Each vertex's summed weight over the named vertex groups."""
    idx = {obj.vertex_groups[n].index for n in names if n in obj.vertex_groups}
    out = np.zeros(len(obj.data.vertices), dtype=np.float32)
    for v in obj.data.vertices:
        out[v.index] = sum(g.weight for g in v.groups if g.group in idx)
    return out


# The skin under the jeans is kept below this height (metres up from the soles): the shins and ankles, so a
# camera looking up a trouser leg sees a leg going into the shoe, not the sky through an empty hem.
KEEP_SHINS_BELOW = 0.3
ANKLE_STUB = 0.045
ANKLE_REACH = 0.06


def apply_masks(body):
    """
    The body's mask modifiers (helpers, what the clothes hide) made real, so
    the export has no hidden faces; the lower legs stay (KEEP_SHINS_BELOW).
    """
    for m in list(body.modifiers):
        if m.type != "MASK":
            continue
        low = [(body.matrix_world @ v.co).z < KEEP_SHINS_BELOW for v in body.data.vertices]
        inside = group_weight(body, [m.vertex_group]) > 0.5
        invert = m.invert_vertex_group
        # Only a clothes mask (inverted: it hides what a garment covers) spares the shins; the helper mask
        # (MakeHuman's joint cubes and fitting shapes, kept where the body group is) still takes everything.
        keep_only(body, lambda i: bool(inside[i]) != invert or (invert and low[i]))
        body.modifiers.remove(m)


# A relaxed hand, degrees of curl at each finger's three joints (knuckle, middle, tip): the fingers a little
# closed and the little finger most, the thumb in toward the palm. MakeHuman's hand is flat, spread like a
# star; the game folds the fingers into the hand bone, so whatever shape they have here is the shape they keep.
CURL = {
    "index": (16, 26, 14),
    "middle": (20, 30, 16),
    "ring": (24, 34, 18),
    "pinky": (28, 38, 20),
    "thumb": (8, 16, 10),
}
# Each finger's spread closed a little toward the middle finger at the knuckle, degrees.
SPREAD = {"index": -4, "middle": 0, "ring": 4, "pinky": 8, "thumb": 0}
# Which way a positive curl turns a finger bone about its own X, and a positive spread about its Z, in
# MakeHuman's game_engine rig (found by rendering the hand, RIDER_DEBUG_BLEND).
CURL_SIGN = (1, 1)


# The tee's hem ends this far above the hip joints (metres, before the game's fit scales the rider down; since
# 2026-11-13 the fit places the tee by the hips alone, which lowers it about 5 cm, so 8 cm here is 2 cm in the game). The
# suit's tee hangs 4 cm below them, so a crouch swung the thighs forward through it and left the tee showing in a
# V between the legs, like a leotard; above the joints the thighs never reach it.
HEM_ABOVE_HIP = 0.08


HEM_BINS = 48
# The band the hem is squeezed into (2026-11-13, ADR-101): its top stands HEM_BAND above the hem's target, never
# less than HEM_BAND_MIN. Before, the band's top was 2 cm under the jeans' waistband, which is 6.7 mm *under* the
# target in this rider, so the squeeze factor went negative and the band folded inside out: the black ring at the
# waist (444 shirt vertices in the 6.7 mm between the two).
HEM_BAND = 0.08
HEM_BAND_MIN = 0.05
# Where the per-column numbers are written, beside the output, for the tests (src/asset/riderHem.test.ts).
HEM_REPORT = os.path.join(HERE, "rider-hem.json")


def raise_hem(suit, shirt, rig):
    """
    Squeezes the tee's lower band upward: every shirt vertex below the band's
    top moves up in proportion, the hem to HEM_ABOVE_HIP over the hip joints
    and the band's top where it was. Level all the way round (2026-11-13):
    each vertex is squeezed by its own column's lowest point (HEM_BINS round
    the torso), so the suit's hem, which hung 5 cm lower at the front middle
    than at the sides, no longer ends in a point between the legs. The band's
    top is HEM_BAND above the target, so every column's factor is in (0, 1]
    and the cloth keeps its order (ADR-101); the build fails otherwise.
    """
    mw = suit.matrix_world
    inv = mw.inverted()
    co = [mw @ v.co for v in suit.data.vertices]
    jeans_top = max(c.z for c, s in zip(co, shirt) if not s)
    hip = (rig.matrix_world @ rig.data.bones["thigh_l"].head_local).z
    target = hip + HEM_ABOVE_HIP
    top = target + HEM_BAND
    band = [c for c, s in zip(co, shirt) if s and c.z < top]
    cx = sum(c.x for c in band) / len(band)
    cy = sum(c.y for c in band) / len(band)

    def column(c):
        return int(((math.atan2(c.x - cx, c.y - cy) / (2 * math.pi)) % 1) * HEM_BINS) % HEM_BINS

    low = [top] * HEM_BINS
    filled = [False] * HEM_BINS
    for c in band:
        b = column(c)
        low[b] = min(low[b], c.z)
        filled[b] = True
    # A column with no band in it takes its neighbours' (the smallest within two).
    low = [min(low[(b + d) % HEM_BINS] for d in (-2, -1, 0, 1, 2)) for b in range(HEM_BINS)]
    factors = []
    for b in range(HEM_BINS):
        k = (top - target) / (top - low[b]) if top - low[b] > 1e-6 else 1
        if top - target < HEM_BAND_MIN - 1e-9:
            raise RuntimeError(f"hem band too thin: {top - target}")
        if not (0 < k <= 1):
            raise RuntimeError(f"hem column {b}: factor {k} outside (0, 1] (low {low[b]}, top {top}, target {target})")
        factors.append(k)
    moved = 0
    for v, c, s in zip(suit.data.vertices, co, shirt):
        if s and c.z < top:
            k = factors[column(c)]
            c.z = top - (top - c.z) * k
            v.co = inv @ c
            moved += 1
    with open(HEM_REPORT, "w") as f:
        json.dump({
            "hip": hip, "target": target, "top": top, "jeansTop": jeans_top, "moved": moved,
            "columns": [{"low": low[b], "factor": factors[b], "filled": filled[b]} for b in range(HEM_BINS)],
        }, f, indent=1)


# How much longer the jeans are made below the knee (metres, before the game's fit): the hems then sit on the
# shoes, as skaters' jeans do, so no gap opens between the hem and the shoe's collar when the ankle bends.
# 2026-11-13: JEANS_DROP on average, JEANS_SLANT more at the back of each leg and that much less at the front, so
# the hem breaks over the shoe as jeans do, down over the heel and up on the tongue. Level, 3.5 cm lower all
# round, its front cut deep into the shoe whenever the shin leaned forward over the foot (a crouch, a landing).
JEANS_DROP = 0.02
JEANS_SLANT = 0.025
# The body below this height (metres) is a sock, its own region (SOCK), which the game tints dark: what shows
# between the hem and the shoe's collar, or up inside the hem, is a sock, as on a skater, never bare skin
# (2026-11-13). Above the shins kept under the jeans (KEEP_SHINS_BELOW), so none of them shows as skin.
SOCK_TOP = KEEP_SHINS_BELOW + 0.02


def lengthen_jeans(suit, shirt, rig):
    """
    Stretches each jeans leg below the knee downward, the knee fixed: the hem JEANS_DROP lower on average,
    JEANS_SLANT more at the back of the leg (+Y, the body faces -Y) and that much less at the front.
    """
    mw = suit.matrix_world
    inv = mw.inverted()
    knee = (rig.matrix_world @ rig.data.bones["calf_l"].head_local).z
    co = [mw @ v.co for v in suit.data.vertices]
    hem = min(c.z for c, s in zip(co, shirt) if not s)
    # Each leg's middle and half depth front to back, from its last 3 cm above the hem.
    legs = {}
    for side in (1, -1):
        low = [c.y for c, s in zip(co, shirt) if not s and c.z < hem + 0.03 and c.x * side > 0]
        legs[side] = ((max(low) + min(low)) / 2, (max(low) - min(low)) / 2)
    for v, c, s in zip(suit.data.vertices, co, shirt):
        if not s and c.z < knee:
            mid, half = legs[1 if c.x > 0 else -1]
            k = max(-1.0, min(1.0, (c.y - mid) / half))
            c.z -= (JEANS_DROP + JEANS_SLANT * k) * (knee - c.z) / (knee - hem)
            v.co = inv @ c


def relax_hands(rig, meshes):
    """
    Curls the fingers (CURL, SPREAD) and makes that the rest pose: each mesh
    deformed by its armature and the armature's rest set to the pose, so the
    export's hand is relaxed with nothing posed.
    """
    from mathutils import Euler

    pose = rig.pose.bones
    for finger, angles in CURL.items():
        for side in ("l", "r"):
            for k, a in enumerate(angles):
                b = pose.get(f"{finger}_0{k + 1}_{side}")
                if b is None:
                    continue
                b.rotation_mode = "XYZ"
                spread = SPREAD[finger] if k == 0 else 0
                b.rotation_euler = Euler((math.radians(a * CURL_SIGN[0]), 0, math.radians(spread * CURL_SIGN[1] * (1 if side == "l" else -1))), "XYZ")
    bpy.context.view_layer.update()
    skinned = [o for o in meshes if any(m.type == "ARMATURE" for m in o.modifiers)]
    for o in skinned:
        arm = next(m for m in o.modifiers if m.type == "ARMATURE")
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier=arm.name)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in skinned:
        o.modifiers.new("Armature", "ARMATURE").object = rig


def remap_uvs(obj, rect):
    x, y, side = rect
    u0 = (x + PAD) / ATLAS_SIDE
    s = (side - 2 * PAD) / ATLAS_SIDE
    v0 = 1 - (y + side - PAD) / ATLAS_SIDE
    for loop in obj.data.uv_layers.active.data:
        u, v = loop.uv
        loop.uv = (u0 + min(max(u, 0), 1) * s, v0 + min(max(v, 0), 1) * s)


def set_region(obj, region_of_vertex):
    attr = obj.data.color_attributes.new("Region", "FLOAT_COLOR", "POINT")
    for i in range(len(obj.data.vertices)):
        attr.data[i].color = (region_of_vertex(i) / 10, 0, 0, 1)
    obj.data.color_attributes.active_color = attr


def paste(atlas, rect, px):
    x, y, side = rect
    atlas[y:y + side, x:x + side] = px


def band_layout(rect, top, bottom):
    """
    How a band of a picture (rows from `top` to `bottom`, fractions of its
    height from the top) fills a rectangle inside PAD: the width and the full
    height to scale the picture to, and the first row of the band at that size.
    The same numbers place the band's pixels and its UVs, so they never drift.
    """
    x, y, w, h = rect
    iw, ih = w - 2 * PAD, h - 2 * PAD
    full = round(ih / (bottom - top))
    r0 = round(full * top)
    return iw, full, r0


def paste_band(atlas, rect, img, top, bottom, shade=None):
    """A band of an image into a rectangle: scaled so the band fills it inside PAD, the PAD filled from its edges."""
    x, y, w, h = rect
    iw, full, r0 = band_layout(rect, top, bottom)
    ih = h - 2 * PAD
    tmp = img.copy()
    tmp.scale(iw, full)
    px = np.array(tmp.pixels[:], dtype=np.float32).reshape(full, iw, 4)[::-1]
    bpy.data.images.remove(tmp)
    band = px[r0:r0 + ih].copy()
    if band.shape[0] < ih:
        band = np.concatenate([band, np.repeat(band[-1:], ih - band.shape[0], axis=0)])
    if shade is not None:
        band = shade(band, r0, full)
    atlas[y:y + h, x:x + w] = np.pad(band, ((PAD, PAD), (PAD, PAD), (0, 0)), mode="edge")


def remap_band_uvs(obj, rect, top, bottom, which):
    """The UVs of the loops whose vertex `which` picks, onto a band placed by paste_band (V up, the picture's rows down)."""
    x, y, w, h = rect
    iw, full, r0 = band_layout(rect, top, bottom)
    ih = h - 2 * PAD
    data = obj.data.uv_layers.active.data
    for loop in obj.data.loops:
        if not which(loop.vertex_index):
            continue
        u, v = data[loop.index].uv
        row = min(max((1 - v) * full - r0, 0), ih)
        px = x + PAD + min(max(u, 0), 1) * iw
        py = y + PAD + row
        data[loop.index].uv = (px / ATLAS_SIDE, 1 - py / ATLAS_SIDE)


def knit(side):
    """A plain rib knit for the beanie: light grey ribs, tinted in the game."""
    u = np.linspace(0, 1, side, endpoint=False)
    ribs = 0.86 + 0.1 * np.sin(u * 2 * math.pi * 48)
    rows = 0.97 + 0.03 * np.sin(u * 2 * math.pi * 80)
    g = np.outer(rows, ribs)
    px = np.ones((side, side, 4), dtype=np.float32)
    px[..., 0] = px[..., 1] = px[..., 2] = g
    return px


BEANIE_SEGMENTS = 64
BEANIE_RINGS = 18
BEANIE_FLIPPED = [False]  # for the build's printout
# Ring smoothing (2026-11-13): each distance is held to the median of this many either side, plus 4 mm.
BEANIE_SMOOTH = 4
# The buzz cut (2026-11-13): how far below the beanie's edge the scalp is tinted as hair, at the back (metres); it
# narrows to BUZZ_SIDE over the ears and to nothing at the brow, where only the skin under the knit is tinted.
BUZZ_BACK = 0.024
BUZZ_SIDE = 0.01
BUZZ_FADE = 0.012
# The buzz cut's colour in the atlas (sRGB), how much of the skin it covers at full, and its stubble's grain.
BUZZ_COLOUR = (0.2, 0.14, 0.1)
BUZZ_COVER = 0.9
BUZZ_GRAIN = 0.25
BUZZ_BLEED = 3


def paint_buzz(atlas, body, amount):
    """
    Paints the buzz cut into the skin's picture in the atlas (2026-11-13):
    every face of the scalp drawn in its UVs, the hair's amount (buzz)
    interpolated across it per pixel, so the hairline is a soft fade, not the
    zig-zag a colour per vertex makes across the head's large faces. A seeded
    grain makes it read as stubble. Before remap_uvs: the body's UVs are its
    own picture's, which RECTS["body"] holds with PAD inside.
    """
    x0, y0, side = RECTS["body"]
    inner = side - 2 * PAD
    uvs = body.data.uv_layers.active.data
    grain = np.random.default_rng(7).random((side, side)).astype(np.float32)
    colour = np.array(BUZZ_COLOUR, dtype=np.float32)
    for poly in body.data.polygons:
        a = [amount[body.data.loops[k].vertex_index] for k in poly.loop_indices]
        if max(a) < 1e-3:
            continue
        pts = [((x0 + PAD + uvs[k].uv[0] * inner), (y0 + PAD + (1 - uvs[k].uv[1]) * inner)) for k in poly.loop_indices]
        for i in range(1, len(pts) - 1):
            tri = (pts[0], pts[i], pts[i + 1])
            ta = (a[0], a[i], a[i + 1])
            xs = [p[0] for p in tri]
            ys = [p[1] for p in tri]
            lx, hx = int(max(math.floor(min(xs)) - BUZZ_BLEED, x0)), int(min(math.ceil(max(xs)) + BUZZ_BLEED, x0 + side - 1))
            ly, hy = int(max(math.floor(min(ys)) - BUZZ_BLEED, y0)), int(min(math.ceil(max(ys)) + BUZZ_BLEED, y0 + side - 1))
            if hx < lx or hy < ly:
                continue
            gx, gy = np.meshgrid(np.arange(lx, hx + 1) + 0.5, np.arange(ly, hy + 1) + 0.5)
            (ax, ay), (bx, by), (cx, cy) = tri
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-9:
                continue
            w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
            w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
            w2 = 1 - w0 - w1
            # BUZZ_BLEED pixels past each edge too, so the faces meet without a seam, and a UV seam (where the skin's
            # picture is cut, down the back of the head) is covered on both sides.
            ab, bc, ca = math.dist((ax, ay), (bx, by)), math.dist((bx, by), (cx, cy)), math.dist((cx, cy), (ax, ay))
            area2 = abs(den)
            inside = (w0 >= -BUZZ_BLEED * bc / area2) & (w1 >= -BUZZ_BLEED * ca / area2) & (w2 >= -BUZZ_BLEED * ab / area2)
            if not inside.any():
                continue
            h = np.clip(w0 * ta[0] + w1 * ta[1] + w2 * ta[2], 0, 1) * BUZZ_COVER
            block = atlas[ly:hy + 1, lx:hx + 1, :3]
            g = grain[ly - y0:hy + 1 - y0, lx - x0:hx + 1 - x0, None]
            hair = colour * (1 - BUZZ_GRAIN / 2 + BUZZ_GRAIN * g)
            mixed = block * (1 - h[..., None]) + hair * h[..., None]
            block[inside] = mixed[inside]


def make_beanie(body):
    """
    A beanie over the skull, built ring by ring round the head: each point
    sits a little off the skull (found by casting a ray out from inside the
    head), from a smooth brow line up to the crown, with a folded cuff at the
    bottom and a rim tucked back to the skin so its inside never shows.
    """
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    hw = group_weight(body, ["head"])
    pts = np.array([tuple(body.matrix_world @ v.co) for v in body.data.vertices])[hw > 0.9]
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    top = hi[2]
    # The skull's middle: a little behind the head's box centre (the face sticks out) and at ear height.
    origin = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2 + 0.01, lo[2] + 0.62 * (top - lo[2])))
    # The brow line: 64 percent up the head at the front, down to the hairline at the back (8.5 cm lower),
    # easing round over the tops of the ears (3 cm lower at the sides).
    brow = lo[2] + 0.64 * (top - lo[2])

    def edge_z(theta):
        return brow - 0.085 * ((1 - math.cos(theta)) / 2) ** 1.5

    depsgraph = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(body, depsgraph)
    ax, ay = (hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2
    az = top - origin.z

    def skull(theta, phi):
        """The distance from origin to the skin along a direction: theta round (0 the face, -Y), phi up from level."""
        d = Vector((math.sin(theta) * math.cos(phi) * ax, -math.cos(theta) * math.cos(phi) * ay, math.sin(phi) * az)).normalized()
        hit = tree.ray_cast(origin, d)
        r = (hit[0] - origin).length if hit[0] is not None else 0.1
        return d, r

    def thickness(s):
        """How far off the skin above the cuff, by the height up the beanie (0 the cuff's top, 1 the crown): snug, a little slack on top."""
        return 0.011 + 0.007 * s * s

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rows = []  # each a ring of (vert, u, v)
    # (height up the beanie from the edge, 0 to 1; offset off the skin): the rim tucked under, the folded cuff
    # standing 5 mm proud of the knit above it, the fold, then the knit up to the crown.
    CUFF = 0.24
    ring_spec = [(0.0, 0.010, 0.005), (0.0, 0.016, 0.0), (0.08, 0.017, 0.0), (0.16, 0.017, 0.0), (CUFF, 0.016, 0.0), (CUFF + 0.01, 0.011, 0.0)]
    ring_spec += [(CUFF + 0.02 + (1 - CUFF - 0.02) * k / (BEANIE_RINGS - 1), None, 0.0) for k in range(BEANIE_RINGS)]
    for s, off, lift in ring_spec:
        ring = []
        hits = []
        for j in range(BEANIE_SEGMENTS):
            theta = 2 * math.pi * j / BEANIE_SEGMENTS
            # phi at the bottom edge, from the edge height on an ellipsoid round the skull; up to just short of the pole.
            phi0 = math.asin(max(-0.95, min(0.95, (edge_z(theta) - origin.z) / az)))
            phi = phi0 + (math.radians(88) - phi0) * s
            hits.append(skull(theta, phi))
        # The ring's distances, smoothed (2026-11-13): a ray that met an ear, not the skull, pushed the rim out in a
        # wing over each ear. Each distance is held to its neighbours' median (BEANIE_SMOOTH either side) plus 4 mm,
        # then averaged with the two beside it, so the knit runs round the skull.
        rs = [r for _, r in hits]
        n = len(rs)
        held = [min(rs[j], sorted(rs[(j + k) % n] for k in range(-BEANIE_SMOOTH, BEANIE_SMOOTH + 1))[BEANIE_SMOOTH] + 0.004) for j in range(n)]
        rs = [(held[(j - 1) % n] + 2 * held[j] + held[(j + 1) % n]) / 4 for j in range(n)]
        for j in range(BEANIE_SEGMENTS):
            d = hits[j][0]
            o = thickness((s - CUFF) / (1 - CUFF)) if off is None else off
            co = origin + d * (rs[j] + o)
            co.z += lift
            ring.append((bm.verts.new(co), j / BEANIE_SEGMENTS, s))
        rows.append(ring)
    crown_d, crown_r = skull(0, math.radians(90))
    crown = bm.verts.new(origin + crown_d * (crown_r + thickness(1.0)))
    bm.verts.ensure_lookup_table()
    for a, b in zip(rows, rows[1:]):
        for j in range(BEANIE_SEGMENTS):
            k = (j + 1) % BEANIE_SEGMENTS
            f = bm.faces.new((a[j][0], a[k][0], b[k][0], b[j][0]))
            for loop, (u, v) in zip(f.loops, ((a[j][1], a[j][2]), (a[j][1] + 1 / BEANIE_SEGMENTS, a[k][2]), (b[j][1] + 1 / BEANIE_SEGMENTS, b[k][2]), (b[j][1], b[j][2]))):
                loop[uv_layer].uv = (u, v)
    last = rows[-1]
    for j in range(BEANIE_SEGMENTS):
        k = (j + 1) % BEANIE_SEGMENTS
        f = bm.faces.new((last[j][0], last[k][0], crown))
        for loop, uvp in zip(f.loops, ((last[j][1], 1.0), (last[j][1] + 1 / BEANIE_SEGMENTS, 1.0), (last[j][1] + 0.5 / BEANIE_SEGMENTS, 1.0))):
            loop[uv_layer].uv = uvp
    # Faces out, away from the skull (the game draws one side): flip them all if most point in.
    bm.normal_update()
    inward = sum(1 for f in bm.faces if f.normal.dot(f.calc_center_median() - origin) < 0)
    if inward > len(bm.faces) / 2:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        BEANIE_FLIPPED[0] = True
    me = bpy.data.meshes.new("Beanie")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    cap = bpy.data.objects.new("Beanie", me)
    bpy.context.scene.collection.objects.link(cap)
    cap.vertex_groups.new(name="head").add(range(len(me.vertices)), 1.0, "REPLACE")

    def covered(co):
        """Whether a point is under the beanie: above its edge at that angle round the head."""
        theta = math.atan2(co.x - origin.x, -(co.y - origin.y))
        return co.z > edge_z(theta) - 0.005

    def buzz(co):
        """
        How much a scalp point is short hair, 0 to 1: on the skull (not an
        ear, which stands off it), above the hairline, which runs BUZZ_BACK
        under the beanie's edge at the back, BUZZ_SIDE over the ears and just
        inside the knit at the brow, faded in over BUZZ_FADE.
        """
        theta = math.atan2(co.x - origin.x, -(co.y - origin.y))
        back = (1 - math.cos(theta)) / 2
        below = BUZZ_BACK * back ** 1.5 + BUZZ_SIDE * math.sin(theta) ** 2 - 0.006 * (1 - back) ** 2
        t = (co.z - (edge_z(theta) - below)) / BUZZ_FADE + 0.5
        if t <= 0:
            return 0.0
        d = (co - origin).normalized()
        hit = tree.ray_cast(origin, d)
        if hit[0] is None or (co - origin).length > (hit[0] - origin).length + 0.006:
            return 0.0
        t = min(1.0, t)
        return t * t * (3 - 2 * t)

    def tuck(co):
        """A point pressed down onto the skull, 4 mm off the skin: inside the beanie, whose knit is 11 mm or more off it."""
        d = (co - origin).normalized()
        hit = tree.ray_cast(origin, d)
        return origin + d * ((hit[0] - origin).length + 0.004) if hit[0] is not None else co

    return cap, covered, tuck, buzz


def main():
    clear_scene()
    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    body = HumanService.deserialize_from_dict(HUMAN, settings)
    rig = body.parent
    parts = {o.name: o for o in rig.children if o.type == "MESH"}

    def find(key):
        return next(o for n, o in parts.items() if key in n)

    suit, hair = find("casualsuit06"), find("short02")
    eyes, brows, lashes = find("low-poly"), find("eyebrow001"), find("eyelashes01")

    # The phenotype lives in shape keys, which the export would drop: bake them into each mesh first.
    for o in (body, suit, hair, eyes, brows, lashes):
        if o.data.shape_keys:
            with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                bpy.ops.object.shape_key_remove(all=True, apply_mix=True)

    apply_masks(body)
    # No feet: the game draws its own shoes over the ankles. A stub of each ankle stays, down to ANKLE_STUB above
    # the soles and ANKLE_REACH round the ankle joint, so the leg goes on into the shoe's collar (the shoe is not
    # skinned to the rider, so a whole foot would poke through it when the ankle bends).
    feet = group_weight(body, ["foot_l", "foot_r", "ball_l", "ball_r"])
    ankles = [rig.matrix_world @ rig.data.bones[f"foot_{s}"].head_local for s in ("l", "r")]

    def stub(co):
        return co.z > ANKLE_STUB and min((co.xy - a.xy).length for a in ankles) < ANKLE_REACH

    keep_only(body, lambda i: feet[i] < 0.5 or stub(body.matrix_world @ body.data.vertices[i].co))

    relax_hands(rig, [body, suit, hair, eyes, brows, lashes])

    beanie, covered, tuck, buzz = make_beanie(body)
    beanie.parent = rig
    beanie.modifiers.new("Armature", "ARMATURE").object = rig
    # No hair cards (2026-11-13): what showed under the cuff was the cards' cut-out ends, a ragged fringe at the nape
    # that poked through the knit as the head turned. The hair is a buzz cut instead, painted into the skin below the
    # beanie's edge (paint_buzz), so it fades softly and moves with the skin.
    bpy.data.objects.remove(hair, do_unlink=True)
    del tuck, covered

    # The atlas: each part's picture in its rect; the shirt plain (no logo), its folds from the ambient occlusion.
    atlas = np.zeros((ATLAS_SIDE, ATLAS_SIDE, 4), dtype=np.float32)
    atlas[..., 3] = 1
    paste(atlas, RECTS["body"], image_pixels(diffuse_of(body), RECTS["body"][2]))
    # The buzz cut, painted into the skin under the beanie's edge (paint_buzz); each vertex's amount, its face's pixels between.
    buzz_amount = [buzz(body.matrix_world @ v.co) * (1.0 if w > 0.5 else 0.0) for v, w in zip(body.data.vertices, group_weight(body, ["head", "neck_01"]))]
    paint_buzz(atlas, body, buzz_amount)
    # The suit: its jeans and its shirt each their own band of its picture, in their own rectangles (ADR-101).
    # The shirt is plain, its folds from the ambient occlusion picture (as before, 0.95 of it).
    ao_img = next(n.image for n in suit.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "_ao" in n.image.filepath)
    rect, top, bottom = SUIT_RECTS["shirt"]
    paste_band(atlas, rect, ao_img, top, bottom, shade=lambda band, r0, full: np.concatenate([np.clip(0.95 * band[..., :3], 0, 1), np.ones_like(band[..., 3:])], axis=-1))
    rect, top, bottom = SUIT_RECTS["jeans"]
    paste_band(atlas, rect, diffuse_of(suit), top, bottom)
    paste(atlas, RECTS["eyes"], image_pixels(diffuse_of(eyes), RECTS["eyes"][2]))
    paste(atlas, RECTS["brows"], image_pixels(diffuse_of(brows), RECTS["brows"][2]))
    paste(atlas, RECTS["lashes"], image_pixels(diffuse_of(lashes), RECTS["lashes"][2]))
    paste(atlas, RECTS["beanie"], knit(RECTS["beanie"][2]))

    # Regions, before the UVs move: the suit's shirt is the top of its picture (v over SUIT_SPLIT).
    suit_v = np.zeros(len(suit.data.vertices))
    uvs = suit.data.uv_layers.active.data
    for loop in suit.data.loops:
        suit_v[loop.vertex_index] = uvs[loop.index].uv[1]
    shirt = suit_v > SUIT_SPLIT
    raise_hem(suit, shirt, rig)
    lengthen_jeans(suit, shirt, rig)
    body_z = [(body.matrix_world @ v.co).z for v in body.data.vertices]
    set_region(body, lambda i: SOCK if body_z[i] < SOCK_TOP else SKIN)
    set_region(suit, lambda i: SHIRT if shirt[i] else JEANS)
    set_region(beanie, lambda i: BEANIE)
    set_region(eyes, lambda i: EYES)
    set_region(brows, lambda i: BROWS)
    set_region(lashes, lambda i: BROWS)

    for obj, key in ((body, "body"), (eyes, "eyes"), (brows, "brows"), (lashes, "lashes"), (beanie, "beanie")):
        remap_uvs(obj, RECTS[key])
    for key, pick in (("shirt", lambda i: shirt[i]), ("jeans", lambda i: not shirt[i])):
        rect, top, bottom = SUIT_RECTS[key]
        remap_band_uvs(suit, rect, top, bottom, pick)

    img = bpy.data.images.new("RiderAtlas", ATLAS_SIDE, ATLAS_SIDE, alpha=True)
    img.pixels = atlas[::-1].ravel()
    img.file_format = "PNG"
    img.pack()
    mat = bpy.data.materials.new("RiderAtlas")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.8
    mat.blend_method = "CLIP"

    meshes = [body, suit, eyes, brows, lashes, beanie]
    for o in meshes:
        o.data.materials.clear()
        o.data.materials.append(mat)
        for m in list(o.modifiers):
            if m.type != "ARMATURE":
                o.modifiers.remove(m)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = "RiderSource"
    rig.name = "RiderSourceRig"

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    rig.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format="GLB", use_selection=True, export_skins=True, export_animations=False,
        export_vertex_color="ACTIVE", export_image_format="AUTO", export_yup=True, export_apply=False,
        export_morph=False, export_def_bones=False,
    )
    if os.environ.get("RIDER_DEBUG_BLEND"):
        bpy.ops.wm.save_as_mainfile(filepath=os.environ["RIDER_DEBUG_BLEND"])
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print("RIDER_SOURCE", OUT, "vertices", len(body.data.vertices), "triangles", tris, "height", body.dimensions[2], "beanie faces flipped", BEANIE_FLIPPED[0])


main()
