#!/usr/bin/env python3
import json, math, os, sys
from pathlib import Path

import numpy as np
import open3d as o3d
import trimesh

PCD = Path(os.environ.get("TOWN10_PCD", "Town10HD_Opt/pointcloud_map.pcd"))
OUT = Path(os.environ.get("TOWN10_OUT", "town10-extract"))
OUT.mkdir(parents=True, exist_ok=True)

print("Reading", PCD)
pcd = o3d.io.read_point_cloud(str(PCD))
pts = np.asarray(pcd.points)
if len(pts) < 100000:
    raise RuntimeError(f"Point cloud unexpectedly small: {len(pts)}")

finite = np.isfinite(pts).all(axis=1)
pts = pts[finite]
mins = pts.min(axis=0); maxs = pts.max(axis=0)
ground = float(np.quantile(pts[:,2], 0.02))
print("Full bounds", mins, maxs, "ground", ground, "points", len(pts))

# Pick a compact block with the strongest mix of tall facades + urban density.
# This makes the extraction deterministic and avoids waterfront/empty outer roads.
W = 120.0
step = 15.0
margin = W/2
xs = np.arange(mins[0]+margin, maxs[0]-margin+1e-3, step)
ys = np.arange(mins[1]+margin, maxs[1]-margin+1e-3, step)
best = None
for cx in xs:
    mx = np.abs(pts[:,0]-cx) <= margin
    if mx.sum() < 1000: continue
    p1 = pts[mx]
    for cy in ys:
        m = np.abs(p1[:,1]-cy) <= margin
        q = p1[m]
        if len(q) < 8000: continue
        tall = np.count_nonzero(q[:,2] > ground + 14.0)
        mid  = np.count_nonzero(q[:,2] > ground + 4.0)
        street = np.count_nonzero(q[:,2] < ground + 1.2)
        # Prefer a visually rich block, but penalize windows that are almost all skyscraper.
        score = tall*2.5 + mid*0.9 + min(street, 25000)*0.25
        height = float(np.quantile(q[:,2], .995) - ground)
        if height < 12: score *= .4
        cand = (score, cx, cy, len(q), tall, mid, street, height)
        if best is None or cand[0] > best[0]:
            best = cand

if best is None:
    raise RuntimeError("Could not select a dense Town10 window")
score,cx,cy,nraw,tall,mid,street,height = best
print("Selected", best)

# Slightly larger crop gives visual breathing room around the selected block.
HALF = 67.5
m = (np.abs(pts[:,0]-cx)<=HALF) & (np.abs(pts[:,1]-cy)<=HALF)
crop = pts[m]
crop_pcd = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(crop))
crop_pcd = crop_pcd.voxel_down_sample(voxel_size=0.34)
cp = np.asarray(crop_pcd.points)
print("Crop points after downsample", len(cp))

# Limit extreme scan returns and retain the full street/building envelope.
zlo = float(np.quantile(cp[:,2], .002))
zhi = float(np.quantile(cp[:,2], .999))
keep = (cp[:,2] >= zlo) & (cp[:,2] <= zhi)
crop_pcd = crop_pcd.select_by_index(np.flatnonzero(keep).tolist())
cp = np.asarray(crop_pcd.points)

# Reconstruct a solid visual surface from CARLA's recorded UE5 geometry.
# Poisson gives the best facade continuity. If it fails, use ball pivoting.
crop_pcd.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=1.25, max_nn=40))
try:
    crop_pcd.orient_normals_consistent_tangent_plane(35)
except Exception as e:
    print("Normal orientation warning:", e)

try:
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        crop_pcd, depth=9, scale=1.04, linear_fit=False
    )
    densities = np.asarray(densities)
    # Remove the lowest-density hallucinated shell, then hard-crop to source bounds.
    if len(densities):
        mesh.remove_vertices_by_mask(densities < np.quantile(densities, .075))
    bbox = o3d.geometry.AxisAlignedBoundingBox(
        min_bound=np.array([cx-HALF, cy-HALF, zlo-0.5]),
        max_bound=np.array([cx+HALF, cy+HALF, zhi+0.5])
    )
    mesh = mesh.crop(bbox)
except Exception as e:
    print("Poisson failed, trying ball pivot:", e)
    radii = o3d.utility.DoubleVector([0.28,0.48,0.8,1.25])
    mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_ball_pivoting(crop_pcd, radii)

mesh.remove_duplicated_vertices()
mesh.remove_duplicated_triangles()
mesh.remove_degenerate_triangles()
mesh.remove_unreferenced_vertices()
mesh.compute_vertex_normals()

tri_before = len(mesh.triangles)
TARGET = 185000
if tri_before > TARGET:
    mesh = mesh.simplify_quadric_decimation(TARGET)
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_unreferenced_vertices()
    mesh.compute_vertex_normals()
print("Triangles", tri_before, "->", len(mesh.triangles))

v = np.asarray(mesh.vertices).copy()
f = np.asarray(mesh.triangles).copy()
norm = np.asarray(mesh.vertex_normals).copy()
if len(v)==0 or len(f)==0:
    raise RuntimeError("Reconstruction produced an empty mesh")

# Procedural, lightweight city palette. Geometry remains Town10-derived.
# CARLA's point cloud has geometry but not its original UE materials/textures.
base_ground = ground
colors = np.empty((len(v),4), dtype=np.uint8)
colors[:] = [154,158,158,255]
for i,(x,y,z) in enumerate(v):
    nz = norm[i,2] if len(norm)==len(v) else 0
    h = z-base_ground
    if h < 0.9 and nz > 0.35:
        # asphalt / pavement
        stripe = (int(abs(x)*0.35)+int(abs(y)*0.35)) % 17
        colors[i] = [58+stripe//5,61+stripe//5,63+stripe//5,255]
    elif nz > 0.60:
        colors[i] = [104,108,109,255] if h>5 else [112,114,112,255]
    else:
        # facade: glassier on tall structures, masonry/concrete lower down
        tallish = h > 18
        floor = int(max(h,0)/3.15)
        band = (int(abs(x)*0.42)+int(abs(y)*0.37)+floor*3) % 11
        if tallish and band < 6:
            colors[i] = [55,73,83,255]
        elif band in (1,2) and h > 3:
            colors[i] = [44,57,63,255]
        else:
            tone = 132 + ((int(x*0.13)+int(y*0.11)) % 4)*10
            colors[i] = [tone, max(118,tone-8), max(108,tone-17),255]

# CARLA/Autoware: X/Y horizontal, Z up. Three.js: X/Z horizontal, Y up.
# Recenter this block at origin; negate horizontal Y so handedness matches game.
vv = np.empty_like(v)
vv[:,0] = v[:,0]-cx
vv[:,1] = v[:,2]-base_ground
vv[:,2] = -(v[:,1]-cy)

tm = trimesh.Trimesh(vertices=vv, faces=f, vertex_colors=colors, process=False)
tm.remove_unreferenced_vertices()
tm.fix_normals()

glb = OUT/"town10_best_block.glb"
tm.export(glb)

# Also export a low-detail LOD for distance rendering.
lod = tm.copy()
try:
    # trimesh simplification depends on fast-simplification; installed in workflow.
    lod = lod.simplify_quadric_decimation(face_count=45000)
except Exception as e:
    print("LOD simplification fallback:", e)
lod.export(OUT/"town10_best_block_lod.glb")

meta = {
    "source": "CARLA 0.10 Town10HD_Opt pointcloud_map.pcd",
    "license": "CC-BY-4.0 per CARLA-specific assets; credit CARLA",
    "selection": {
        "center_x": float(cx), "center_y": float(cy), "width_m": HALF*2,
        "score": float(score), "source_points_in_window": int(nraw),
        "tall_points": int(tall), "mid_points": int(mid), "street_points": int(street),
        "height_m_approx": float(height)
    },
    "full_bounds": {"min": mins.tolist(), "max": maxs.tolist()},
    "ground_z": float(base_ground),
    "mesh": {
        "vertices": int(len(tm.vertices)), "triangles": int(len(tm.faces)),
        "lod_vertices": int(len(lod.vertices)), "lod_triangles": int(len(lod.faces)),
        "glb_bytes": glb.stat().st_size
    },
    "note": "Geometry is reconstructed from the CARLA 0.10 Town10 point cloud. Original Unreal Engine materials are not present in the point cloud; compact procedural vertex colors are used for the web-game extraction."
}
(OUT/"town10_best_block.json").write_text(json.dumps(meta,indent=2),encoding="utf-8")
(OUT/"ATTRIBUTION.txt").write_text(
    "Town10 HD geometry source: CARLA Simulator / CARLA-specific assets, CC BY 4.0.\\n"
    "Source recording: AutowareFoundation/carla-ue5-maps, Town10HD_Opt point cloud.\\n"
    "This web-game extraction reconstructs and simplifies a 135 m x 135 m block; original Unreal materials are not included.\\n",
    encoding="utf-8"
)
print(json.dumps(meta,indent=2))
