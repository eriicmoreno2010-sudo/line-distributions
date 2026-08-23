# =============================================================================
# Audio visualizer (Blender 5.2 / EEVEE Next) — barras reactivas al audio +
# portada + título + fondo/glow latiendo con el beat, look neón cian/magenta.
#
# Uso:
#   blender -b -P visualizer.py -- --audio "song.mp3" --cover "cover.png" \
#           --title "Smoothie" --artist "NCT DREAM" --out "out.mp4" \
#           [--fps 30] [--dur 12] [--bars 64] [--res 1280x720] [--samples 16]
#
# Analiza el audio con FFT (numpy), pone keyframes en las barras y el glow, y
# renderiza frames PNG que luego une con ffmpeg + el audio original -> mp4.
# =============================================================================
import bpy, sys, os, wave, subprocess, tempfile, math
import numpy as np

# ---------- args tras "--" ----------
argv = sys.argv
argv = argv[argv.index("--")+1:] if "--" in argv else []
def opt(name, default=None):
    return argv[argv.index(name)+1] if name in argv else default

AUDIO  = opt("--audio")
COVER  = opt("--cover")
TITLE  = opt("--title", "")
ARTIST = opt("--artist", "")
OUT    = opt("--out", "visualizer.mp4")
FPS    = int(opt("--fps", "30"))
DUR    = opt("--dur")                       # None = canción entera
BARS   = int(opt("--bars", "64"))
RES    = opt("--res", "1280x720")
SAMPLES= int(opt("--samples", "16"))        # muestras EEVEE (bajar = más rápido)
RW, RH = [int(x) for x in RES.lower().split("x")]

AUDIO = os.path.abspath(AUDIO) if AUDIO else None
COVER = os.path.abspath(COVER) if COVER else None
OUT   = os.path.abspath(OUT)
if not AUDIO or not os.path.isfile(AUDIO):
    print("ERROR: falta --audio válido"); sys.exit(1)

C1 = (0.13, 0.83, 0.93)   # cian
C2 = (1.00, 0.18, 0.69)   # magenta

def lerp(a, b, t): return tuple(a[i] + (b[i]-a[i])*t for i in range(3))

# ---------- 1) audio -> WAV mono para analizar ----------
tmp = tempfile.mkdtemp(prefix="viz_")
wav = os.path.join(tmp, "a.wav")
SR = 22050
subprocess.run(["ffmpeg","-y","-i",AUDIO,"-ac","1","-ar",str(SR),wav],
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

wf = wave.open(wav, "rb")
n = wf.getnframes()
samples = np.frombuffer(wf.readframes(n), dtype=np.int16).astype(np.float32)/32768.0
wf.close()
total_dur = n/SR
dur = min(float(DUR), total_dur) if DUR else total_dur
NF = int(dur*FPS)
print("Audio: %.1fs  ->  %d frames @ %dfps" % (dur, NF, FPS))

# ---------- 2) FFT por frame -> energía por banda + graves ----------
WIN = 2048
freqs = np.fft.rfftfreq(WIN, 1.0/SR)
edges = np.logspace(np.log10(60), np.log10(SR*0.45), BARS+1)
band_idx = [np.where((freqs>=edges[k]) & (freqs<edges[k+1]))[0] for k in range(BARS)]
bass_sel = np.where((freqs>=45) & (freqs<150))[0]
hann = np.hanning(WIN)

band = np.zeros((NF, BARS), np.float32)
bass = np.zeros(NF, np.float32)
for f in range(NF):
    c = int(f/FPS*SR); a = max(0, c-WIN//2); seg = samples[a:a+WIN]
    if len(seg) < WIN: seg = np.pad(seg, (0, WIN-len(seg)))
    mag = np.abs(np.fft.rfft(seg*hann))
    for k in range(BARS):
        sel = band_idx[k]; band[f,k] = mag[sel].mean() if sel.size else 0.0
    bass[f] = mag[bass_sel].mean() if bass_sel.size else 0.0

# normaliza CADA barra por su propio máximo -> todas bailan y la onda llena el ancho
band /= (band.max(axis=0, keepdims=True) + 1e-9)
band = np.clip(band, 0, 1) ** 0.7
bass /= (np.percentile(bass, 99) + 1e-9); bass = np.clip(bass, 0, 1)
# suavizado temporal del beat (ataque rápido, caída lenta)
for f in range(1, NF):
    if bass[f] < bass[f-1]: bass[f] = bass[f-1]*0.82 + bass[f]*0.18

# ---------- 3) escena limpia ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
try: bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
except Exception: pass
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = RW
scene.render.resolution_y = RH
scene.render.fps = FPS
scene.frame_start = 1
scene.frame_end = NF
try: scene.eevee.taa_render_samples = SAMPLES
except Exception: pass
world = bpy.data.worlds.new("W"); scene.world = world
world.use_nodes = True
wbg = world.node_tree.nodes["Background"]
wbg.inputs[0].default_value = (0.008,0.010,0.020,1)
wbg.inputs[1].default_value = 1.0

def emission_mat(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission"); o = nt.nodes.new("ShaderNodeOutputMaterial")
    e.inputs[0].default_value = (*color, 1); e.inputs[1].default_value = strength
    nt.links.new(e.outputs[0], o.inputs[0]); return m

# ---------- 4) barras (waveform) ----------
span = 12.0
bw = span / BARS
for i in range(BARS):
    bpy.ops.mesh.primitive_cube_add(size=1)
    bar = bpy.context.active_object
    bar.name = "bar%03d" % i
    bar.scale = (bw*0.46, 0.35, 1.0)
    bar.location = (-span/2 + (i+0.5)*bw, 0, 0)
    col = lerp(C1, C2, i/(BARS-1))
    bar.data.materials.append(emission_mat("m%03d"%i, col, 1.9))
    # keyframes de la altura (scale Z) — origen en el centro => crece arriba y abajo
    for f in range(NF):
        h = 0.12 + band[f,i]*8.0
        bar.scale.z = h
        bar.keyframe_insert(data_path="scale", index=2, frame=f+1)

# ---------- 5) portada (plano con textura) ----------
if COVER and os.path.isfile(COVER):
    bpy.ops.mesh.primitive_plane_add(size=1)
    cov = bpy.context.active_object; cov.name = "cover"
    cov.rotation_euler = (math.radians(90), 0, 0)
    cov.scale = (3.0, 3.0, 3.0)
    cov.location = (-5.0, -0.4, 2.9)
    img = bpy.data.images.load(COVER)
    m = bpy.data.materials.new("cover_m"); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
    e = nt.nodes.new("ShaderNodeEmission"); e.inputs[1].default_value = 1.4
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs[0], e.inputs[0]); nt.links.new(e.outputs[0], o.inputs[0])
    cov.data.materials.append(m)

# ---------- 6) texto (título + grupo) ----------
def add_text(txt, size, x, y, z, color, strength):
    tc = bpy.data.curves.new(type="FONT", name="t"); tc.body = txt
    ob = bpy.data.objects.new("txt", tc); bpy.context.collection.objects.link(ob)
    tc.size = size; tc.align_x = 'LEFT'
    ob.rotation_euler = (math.radians(90), 0, 0)
    ob.location = (x, y, z)
    ob.data.materials.append(emission_mat("tm", color, strength))
    return ob
if TITLE:  add_text(TITLE, 1.15, -2.2, -0.5, 3.9, (1,1,1), 3.0)
if ARTIST: add_text(ARTIST, 0.44, -2.2, -0.5, 3.1, (0.62,0.69,0.86), 1.8)

# ---------- 7) pulso del fondo con el beat (world sutil, sin inundar) ----------
base_c = np.array([0.006, 0.008, 0.016])
tint   = np.array([0.008, 0.003, 0.014])   # púrpura casi imperceptible en los golpes
for f in range(NF):
    c = base_c + tint*bass[f]
    wbg.inputs[0].default_value = (c[0], c[1], c[2], 1.0)
    wbg.inputs[0].keyframe_insert(data_path="default_value", frame=f+1)

# ---------- 8) cámara + bloom (compositor Glare) ----------
cam_data = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam); scene.camera = cam
cam.location = (0, -15, 0.9); cam.rotation_euler = (math.radians(89.5), 0, 0)
cam_data.lens = 36

# (El bloom/glow neón se aplica luego con ffmpeg — más fiable que el compositor de 5.2.)

# ---------- 9) render frames -> ffmpeg + audio ----------
frames_dir = os.path.join(tmp, "frames"); os.makedirs(frames_dir, exist_ok=True)
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(frames_dir, "f_")
print("Rendering %d frames…" % NF)
bpy.ops.render.render(animation=True)

print("Muxing + bloom con ffmpeg…")
# bloom: aísla lo brillante (curves), lo desenfoca y lo mezcla en modo screen
bloom = ("[0:v]split=2[b][g];"
         "[g]curves=all='0/0 0.66/0 1/1',gblur=sigma=5:steps=2[gl];"
         "[b][gl]blend=all_mode=screen:all_opacity=0.22,format=yuv420p[v]")
subprocess.run(["ffmpeg","-y","-framerate",str(FPS),
                "-i",os.path.join(frames_dir,"f_%04d.png"),
                "-i",AUDIO,"-t",str(dur),
                "-filter_complex",bloom,"-map","[v]","-map","1:a",
                "-c:v","libx264","-pix_fmt","yuv420p","-crf","16",
                "-c:a","aac","-b:a","192k","-shortest",OUT],
               check=True)
print("DONE:", OUT)
