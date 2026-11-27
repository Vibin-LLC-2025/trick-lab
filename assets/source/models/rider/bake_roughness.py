"""Bake the High rider's roughness. Run with Blender --background --python this_file."""
from pathlib import Path

import bpy
import numpy as np

folder = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(folder / "rider-source.glb"))
rider = bpy.data.objects["RiderSource"]
bpy.ops.object.select_all(action="DESELECT")
rider.select_set(True)
bpy.context.view_layer.objects.active = rider

# The source's red channel encodes the eight material regions as code / 10.
# Transfer them to a linear float attribute before baking into the original UVs.
material_values = [0.62, 0.89, 0.82, 0.78, 0.95, 0.32, 0.80, 0.91]
source_name = rider.data.color_attributes.active_color.name
surface = rider.data.color_attributes.new("Surface", "FLOAT_COLOR", "CORNER")
source = rider.data.color_attributes[source_name]
for index, corner in enumerate(source.data):
    value = material_values[round(corner.color[0] * 10)]
    surface.data[index].color = (value, value, value, 1)

material = rider.active_material
nodes = material.node_tree.nodes
links = material.node_tree.links
color = nodes.new("ShaderNodeVertexColor")
color.layer_name = surface.name
emission = nodes.new("ShaderNodeEmission")
links.new(color.outputs["Color"], emission.inputs["Color"])
links.new(emission.outputs[0], next(n for n in nodes if n.type == "OUTPUT_MATERIAL").inputs["Surface"])
image = bpy.data.images.new("Roughness", 256, 256, alpha=False)
image.colorspace_settings.name = "Non-Color"
target = nodes.new("ShaderNodeTexImage")
target.image = image
nodes.active = target
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 1
bpy.ops.object.bake(type="EMIT", margin=4, margin_type="EXTEND")
# Neutral cloth around the padded islands keeps coarse mip levels from turning glossy.
pixels = np.empty(256 * 256 * 4, dtype=np.float32)
image.pixels.foreach_get(pixels)
rgba = pixels.reshape(-1, 4)
rgba[rgba[:, 0] == 0, :3] = 0.82
image.pixels.foreach_set(pixels)
image.filepath_raw = str(folder / "roughness.png")
image.file_format = "PNG"
image.save()
