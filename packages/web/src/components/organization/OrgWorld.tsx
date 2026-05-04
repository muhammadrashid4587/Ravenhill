"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Agent } from "@/lib/AuthContext";

// -----------------------------------------------------------------------------
// OrgWorld — 3D coordination fabric.
//
// Three.js + React Three Fiber scene:
//   • Your agent: glowing oxblood sphere at the origin, hovering above a
//     subtle grid floor.
//   • Departments: floating spheres arranged in a ring overhead; user's
//     own department is pulled closer and sits lower so the trunk to it
//     is short and obvious.
//   • People: small satellites slowly orbiting their department; clickable
//     to open a chat.
//   • Trunks: emissive lines from your agent to every department; glow
//     pulses travel the line for your dept + top-2 by shared knowledge.
//   • Live activity pulses: subscribed to /api/activity/stream; each real
//     from→to event with two resolvable departments fires a bone core
//     pulse traveling between the two department nodes.
//
// Camera: OrbitControls — drag to orbit, trackpad pinch / scroll to zoom,
// damping on. Polar angle clamped so the camera can't flip below the floor.
// -----------------------------------------------------------------------------

type ActivityEvent = {
  type: string;
  from_agent?: string | null;
  to_agent?: string | null;
};

type DeptLayout = {
  name: string;
  position: [number, number, number];
  people: Agent[];
  isMine: boolean;
};

type Pulse = {
  id: number;
  fromKey: string;
  toKey: string;
  startedAt: number;
  trunk: boolean;
};

const RING_RADIUS = 11;
const RING_HEIGHT = 5;
const MINE_RADIUS = 6;
const MINE_HEIGHT = 2.2;
const PULSE_DURATION = 2400;

export default function OrgWorld({
  agents,
  myAgentId,
  myAgentName,
  searchQuery = "",
  onSelect,
}: {
  agents: Agent[];
  myAgentId: string | null;
  myAgentName?: string;
  searchQuery?: string;
  onSelect: (a: Agent) => void;
}) {
  const [hovered, setHovered] = useState<
    | { kind: "dept"; name: string }
    | { kind: "person"; id: string }
    | null
  >(null);

  // Index agents by id.
  const agentsById = useMemo(() => {
    const m: Record<string, Agent> = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  const me = myAgentId ? agentsById[myAgentId] : undefined;
  const myDept = me?.departments?.[0];

  // Group by department, exclude "me" from satellite people.
  const departments = useMemo<DeptLayout[]>(() => {
    const buckets: Record<string, Agent[]> = {};
    const order: string[] = [];
    for (const a of agents) {
      if (a.id === myAgentId) continue;
      const d = a.departments?.[0] || "Other";
      if (!buckets[d]) {
        buckets[d] = [];
        order.push(d);
      }
      buckets[d].push(a);
    }

    // Put user's dept first so it ends up in the "mine" closer position.
    const sorted = [...order];
    if (myDept && sorted.includes(myDept)) {
      sorted.splice(sorted.indexOf(myDept), 1);
      sorted.unshift(myDept);
    }

    const others = sorted.filter((n) => n !== myDept);
    const N = others.length || 1;

    return sorted.map((name) => {
      if (name === myDept) {
        // User's department sits closer and a bit lower, in front.
        return {
          name,
          position: [0, MINE_HEIGHT, -MINE_RADIUS] as [number, number, number],
          people: buckets[name],
          isMine: true,
        };
      }
      const idx = others.indexOf(name);
      // Distribute others evenly around a ring overhead.
      const angle = (idx / N) * Math.PI * 2 + Math.PI / 2;
      // Alternate heights slightly for depth.
      const h = RING_HEIGHT + (idx % 2 === 0 ? 0.8 : -0.8);
      return {
        name,
        position: [
          Math.cos(angle) * RING_RADIUS,
          h,
          Math.sin(angle) * RING_RADIUS,
        ] as [number, number, number],
        people: buckets[name],
        isMine: false,
      };
    });
  }, [agents, myAgentId, myDept]);

  const deptByName = useMemo(() => {
    const m: Record<string, DeptLayout> = {};
    for (const d of departments) m[d.name] = d;
    return m;
  }, [departments]);

  // Trunk targets: your dept + top 2 by shared knowledge.
  const trunkTargets = useMemo<DeptLayout[]>(() => {
    const myAreas = new Set(me?.knowledge_areas ?? []);
    const mine = myDept ? deptByName[myDept] : undefined;
    const scored = departments
      .filter((d) => d.name !== myDept)
      .map((d) => {
        const shared = d.people.reduce(
          (acc, p) =>
            acc +
            (p.knowledge_areas ?? []).filter((k) => myAreas.has(k)).length,
          0,
        );
        return { d, shared };
      })
      .sort((a, b) => b.shared - a.shared);
    const top2 = scored.slice(0, 2).map((s) => s.d);
    return [mine, ...top2].filter((d): d is DeptLayout => Boolean(d));
  }, [departments, deptByName, me, myDept]);

  // Live SSE pulses.
  const pulsesRef = useRef<Pulse[]>([]);
  const pulseIdRef = useRef(0);
  const [, tick] = useState(0); // trigger re-renders when pulse list changes
  useEffect(() => {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const es = new EventSource(`${apiBase}/api/activity/stream`);

    const onMessage = (msg: MessageEvent) => {
      let data: ActivityEvent;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (data.type === "ping") return;
      const fa = data.from_agent ? agentsById[data.from_agent] : undefined;
      const ta = data.to_agent ? agentsById[data.to_agent] : undefined;
      const fd = fa?.departments?.[0];
      const td = ta?.departments?.[0];
      if (!fd || !td || fd === td) return;
      if (!deptByName[fd] || !deptByName[td]) return;
      const id = ++pulseIdRef.current;
      pulsesRef.current = [
        ...pulsesRef.current,
        {
          id,
          fromKey: fd,
          toKey: td,
          startedAt: performance.now(),
          trunk: false,
        },
      ];
      tick((n) => n + 1);
      window.setTimeout(() => {
        pulsesRef.current = pulsesRef.current.filter((p) => p.id !== id);
        tick((n) => n + 1);
      }, PULSE_DURATION + 200);
    };

    es.addEventListener("message", onMessage);
    es.onerror = () => {
      /* EventSource auto-retries */
    };
    return () => {
      es.removeEventListener("message", onMessage);
      es.close();
    };
  }, [agentsById, deptByName]);

  // Apply search — returns true if node should be prominent.
  const q = searchQuery.trim().toLowerCase();
  const personMatch = (a: Agent) =>
    !q ||
    a.name.toLowerCase().includes(q) ||
    a.role.toLowerCase().includes(q) ||
    a.knowledge_areas?.some((k) => k.toLowerCase().includes(q)) ||
    a.departments?.some((d) => d.toLowerCase().includes(q));
  const deptMatch = (d: DeptLayout) =>
    !q || d.name.toLowerCase().includes(q) || d.people.some(personMatch);

  return (
    <div className="relative w-full h-[75vh] min-h-[560px] rounded-xl overflow-hidden bg-gradient-to-b from-[#0B0B0D] to-[#000]">
      <Canvas
        camera={{ position: [0, 9, 36], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
      >
        <SceneContents
          departments={departments}
          trunkTargets={trunkTargets}
          myAgentName={myAgentName}
          pulses={pulsesRef.current}
          deptByName={deptByName}
          hovered={hovered}
          setHovered={setHovered}
          onSelect={onSelect}
          personMatch={personMatch}
          deptMatch={deptMatch}
          query={q}
        />

        <DustField count={900} />
        <IntroFlyIn />

        <OrbitControlsWithIdleAutorotate hovered={hovered !== null} />
      </Canvas>

      {/* Vignette — darkens the corners for the movie-lens feel */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Subtle CRT-style scanlines overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.9) 0px, rgba(255,255,255,0.9) 1px, transparent 1px, transparent 3px)",
        }}
      />

      {/* Hover card — HTML overlay (not inside Canvas) */}
      {hovered && (
        <OrgHoverCard
          hovered={hovered}
          deptByName={deptByName}
          agentsById={agentsById}
        />
      )}

      {/* Legend / controls hint */}
      <div className="absolute bottom-3 left-3 text-[10px] text-dusk pointer-events-none select-none font-mono">
        drag to orbit · scroll / pinch to zoom · click a person to reach out
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SceneContents(props: {
  departments: DeptLayout[];
  trunkTargets: DeptLayout[];
  myAgentName?: string;
  pulses: Pulse[];
  deptByName: Record<string, DeptLayout>;
  hovered:
    | { kind: "dept"; name: string }
    | { kind: "person"; id: string }
    | null;
  setHovered: (
    h:
      | { kind: "dept"; name: string }
      | { kind: "person"; id: string }
      | null,
  ) => void;
  onSelect: (a: Agent) => void;
  personMatch: (a: Agent) => boolean;
  deptMatch: (d: DeptLayout) => boolean;
  query: string;
}) {
  const {
    departments,
    trunkTargets,
    myAgentName,
    pulses,
    deptByName,
    hovered,
    setHovered,
    onSelect,
    personMatch,
    deptMatch,
    query,
  } = props;

  return (
    <>
      {/* Atmospheric fog + ambient light */}
      <fog attach="fog" args={["#0a0a0c", 18, 50]} />
      <ambientLight intensity={0.25} />
      <pointLight
        position={[0, 1, 0]}
        intensity={2.2}
        color="#D25A6D"
        distance={12}
      />
      <directionalLight
        position={[8, 12, 8]}
        intensity={0.4}
        color="#F5F0E6"
      />

      {/* Subtle floor grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <circleGeometry args={[30, 64]} />
        <meshBasicMaterial
          color="#8B1E2F"
          transparent
          opacity={0.04}
        />
      </mesh>
      <gridHelper
        args={[40, 20, "#8B1E2F", "#3a1a20"]}
        position={[0, -0.49, 0]}
      />

      {/* You */}
      <YouSphere name={myAgentName} />

      {/* Trunks from You → selected departments */}
      {trunkTargets.map((d) => (
        <Trunk
          key={`trunk-${d.name}`}
          from={[0, 0.4, 0]}
          to={d.position}
          active
        />
      ))}

      {/* Ambient connection lines between all departments (light, static) */}
      <DeptMesh departments={departments} />

      {/* Departments + satellites */}
      {departments.map((d) => {
        const active =
          hovered?.kind === "dept" && hovered.name === d.name;
        const related =
          hovered?.kind === "person" &&
          d.people.some((p) => p.id === hovered.id);
        const dim =
          (query && !deptMatch(d)) ||
          (hovered !== null && !active && !related);
        return (
          <DepartmentNode
            key={`dept-${d.name}`}
            dept={d}
            active={active || related}
            dim={dim}
            onEnter={() => setHovered({ kind: "dept", name: d.name })}
            onLeave={() => setHovered(null)}
            hovered={hovered}
            setHovered={setHovered}
            onSelect={onSelect}
            personMatch={personMatch}
            query={query}
          />
        );
      })}

      {/* Ambient trunk pulses (decorative, continuous) */}
      {trunkTargets.map((d, i) => (
        <TrunkPulse
          key={`tp-${d.name}`}
          from={[0, 0.4, 0]}
          to={d.position}
          phase={i * 0.9}
        />
      ))}

      {/* Live event pulses */}
      {pulses.map((p) => {
        const from = deptByName[p.fromKey];
        const to = deptByName[p.toKey];
        if (!from || !to) return null;
        return (
          <LivePulse
            key={p.id}
            from={from.position}
            to={to.position}
            startedAt={p.startedAt}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------

function YouSphere({ name }: { name?: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ringRef.current) {
      ringRef.current.rotation.y += dt * 0.6;
    }
  });
  return (
    <group position={[0, 0.4, 0]}>
      {/* Core — cranked emissive so bloom picks it up */}
      <mesh>
        <sphereGeometry args={[0.75, 32, 32]} />
        <meshStandardMaterial
          color="#E4768A"
          emissive="#B23246"
          emissiveIntensity={2.4}
          roughness={0.25}
          metalness={0.15}
          toneMapped={false}
        />
      </mesh>
      {/* Halo */}
      <mesh>
        <sphereGeometry args={[1.2, 32, 32]} />
        <meshBasicMaterial
          color="#B23246"
          transparent
          opacity={0.14}
        />
      </mesh>
      {/* Rotating ring, Saturn-like, very faint */}
      <mesh ref={ringRef} rotation={[Math.PI / 2.5, 0, 0]}>
        <torusGeometry args={[1.6, 0.015, 12, 96]} />
        <meshBasicMaterial
          color="#B23246"
          transparent
          opacity={0.35}
        />
      </mesh>
      <Html position={[0, -1.6, 0]} center distanceFactor={9}>
        <div className="pointer-events-none text-center">
          <div className="text-[11px] text-bone font-medium tracking-wide">
            {name ?? "Your agent"}
          </div>
          {name && (
            <div className="text-[9px] text-dusk">Your agent</div>
          )}
        </div>
      </Html>
    </group>
  );
}

function Trunk({
  from,
  to,
}: {
  from: [number, number, number];
  to: [number, number, number];
  active?: boolean;
}) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
    ]);
    return g;
  }, [from, to]);
  return (
    <line>
      <primitive object={geom} attach="geometry" />
      <lineBasicMaterial
        color="#B23246"
        transparent
        opacity={0.55}
        linewidth={1}
      />
    </line>
  );
}

function DeptMesh({ departments }: { departments: DeptLayout[] }) {
  // A light ambient lattice between nearby departments so the fabric reads
  // as a graph, not isolated islands. Connect each dept to its two nearest
  // neighbours.
  const lines = useMemo(() => {
    const result: { a: DeptLayout; b: DeptLayout }[] = [];
    const visited = new Set<string>();
    for (const a of departments) {
      const sorted = departments
        .filter((b) => b.name !== a.name)
        .map((b) => ({
          b,
          d2:
            (a.position[0] - b.position[0]) ** 2 +
            (a.position[1] - b.position[1]) ** 2 +
            (a.position[2] - b.position[2]) ** 2,
        }))
        .sort((x, y) => x.d2 - y.d2);
      for (const { b } of sorted.slice(0, 2)) {
        const key = [a.name, b.name].sort().join("|");
        if (visited.has(key)) continue;
        visited.add(key);
        result.push({ a, b });
      }
    }
    return result;
  }, [departments]);

  return (
    <>
      {lines.map((l, i) => {
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...l.a.position),
          new THREE.Vector3(...l.b.position),
        ]);
        return (
          <line key={`am-${i}`}>
            <primitive object={g} attach="geometry" />
            <lineBasicMaterial
              color="#8B1E2F"
              transparent
              opacity={0.28}
            />
          </line>
        );
      })}
    </>
  );
}

function DepartmentNode({
  dept,
  active,
  dim,
  onEnter,
  onLeave,
  hovered,
  setHovered,
  onSelect,
  personMatch,
  query,
}: {
  dept: DeptLayout;
  active: boolean;
  dim: boolean;
  onEnter: () => void;
  onLeave: () => void;
  hovered:
    | { kind: "dept"; name: string }
    | { kind: "person"; id: string }
    | null;
  setHovered: (
    h:
      | { kind: "dept"; name: string }
      | { kind: "person"; id: string }
      | null,
  ) => void;
  onSelect: (a: Agent) => void;
  personMatch: (a: Agent) => boolean;
  query: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  // Slow independent rotation per department so satellites orbit.
  useFrame((_, dt) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.18;
    }
  });

  const opacity = dim ? 0.22 : 1;

  return (
    <group position={dept.position}>
      {/* Dept sphere */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          onEnter();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onLeave();
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[active ? 0.55 : 0.42, 24, 24]} />
        <meshStandardMaterial
          color="#2A2830"
          emissive={active ? "#B23246" : "#5D0F1D"}
          emissiveIntensity={active ? 0.95 : 0.35}
          roughness={0.4}
          metalness={0.2}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* HUD scan ring — persistent, slowly spins for that live-interface feel */}
      <SpinRing
        radiusInner={0.78}
        radiusOuter={0.86}
        axis="x"
        color={active ? "#F5F0E6" : "#B23246"}
        opacity={active ? 0.6 : 0.28}
        speed={0.35}
      />
      <SpinRing
        radiusInner={0.95}
        radiusOuter={1.0}
        axis="z"
        color={active ? "#D25A6D" : "#8B1E2F"}
        opacity={active ? 0.45 : 0.18}
        speed={-0.22}
      />

      {/* Aura ring on hover */}
      {active && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.9, 48]} />
          <meshBasicMaterial
            color="#D25A6D"
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Label */}
      <Html position={[0, 0.95, 0]} center distanceFactor={11}>
        <div
          className="pointer-events-none text-center select-none"
          style={{ opacity }}
        >
          <div
            className={`text-[10px] ${active ? "text-bone" : "text-parchment"} font-medium tracking-wide whitespace-nowrap`}
          >
            {dept.name}
          </div>
          <div className="text-[8px] text-dusk">
            {dept.people.length}{" "}
            {dept.people.length === 1 ? "person" : "people"}
          </div>
        </div>
      </Html>

      {/* Orbiting satellites */}
      <group ref={groupRef}>
        {dept.people.map((p, i) => {
          const angle = (i / Math.max(1, dept.people.length)) * Math.PI * 2;
          const r = 1.25;
          const pos: [number, number, number] = [
            Math.cos(angle) * r,
            Math.sin(angle * 2) * 0.22,
            Math.sin(angle) * r,
          ];
          const pActive =
            hovered?.kind === "person" && hovered.id === p.id;
          const pMatch = personMatch(p);
          const pDim =
            (query && !pMatch) || (hovered !== null && !pActive && !active);
          return (
            <Satellite
              key={p.id}
              pos={pos}
              active={pActive || active}
              dim={pDim}
              onEnter={() => setHovered({ kind: "person", id: p.id })}
              onLeave={() => setHovered(null)}
              onClick={() => onSelect(p)}
            />
          );
        })}
      </group>
    </group>
  );
}

function SpinRing({
  radiusInner,
  radiusOuter,
  axis,
  color,
  opacity,
  speed,
}: {
  radiusInner: number;
  radiusOuter: number;
  axis: "x" | "y" | "z";
  color: string;
  opacity: number;
  speed: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (axis === "x") ref.current.rotation.x += dt * speed;
    if (axis === "y") ref.current.rotation.y += dt * speed;
    if (axis === "z") ref.current.rotation.z += dt * speed;
  });
  const baseRotation: [number, number, number] =
    axis === "x" ? [Math.PI / 2, 0, 0] : axis === "z" ? [0, 0, Math.PI / 2] : [0, 0, 0];
  return (
    <mesh ref={ref} rotation={baseRotation}>
      <ringGeometry args={[radiusInner, radiusOuter, 64]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function Satellite({
  pos,
  active,
  dim,
  onEnter,
  onLeave,
  onClick,
}: {
  pos: [number, number, number];
  active: boolean;
  dim: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  return (
    <mesh
      position={pos}
      onPointerOver={(e) => {
        e.stopPropagation();
        onEnter();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onLeave();
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <sphereGeometry args={[active ? 0.18 : 0.12, 16, 16]} />
      <meshStandardMaterial
        color={active ? "#F5F0E6" : "#D6CFC0"}
        emissive={active ? "#F5F0E6" : "#8B1E2F"}
        emissiveIntensity={active ? 0.85 : 0.25}
        transparent
        opacity={dim ? 0.25 : 1}
      />
    </mesh>
  );
}

function TrunkPulse({
  from,
  to,
  phase,
}: {
  from: [number, number, number];
  to: [number, number, number];
  phase: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = ((clock.getElapsedTime() + phase) % 2.8) / 2.8;
    meshRef.current.position.set(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    );
    const fade = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = fade * 0.85;
  });
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.09, 12, 12]} />
      <meshBasicMaterial color="#FF4A64" transparent toneMapped={false} />
    </mesh>
  );
}

function LivePulse({
  from,
  to,
  startedAt,
}: {
  from: [number, number, number];
  to: [number, number, number];
  startedAt: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!meshRef.current) return;
    const elapsed = performance.now() - startedAt;
    const t = Math.min(1, elapsed / PULSE_DURATION);
    meshRef.current.position.set(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    );
    const fade = t < 0.08 ? t / 0.08 : t > 0.88 ? (1 - t) / 0.12 : 1;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = fade;
  });
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.14, 16, 16]} />
      <meshBasicMaterial
        color="#FFFFFF"
        transparent
        opacity={0}
        toneMapped={false}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------

// Floating dust motes in the scene for atmospheric depth.
function DustField({ count = 900 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Spread in a large box around origin — denser near center, sparser at edges
      const r = Math.pow(Math.random(), 0.6) * 28;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.cos(phi) * 0.6 + 2; // bias above floor
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    // Slow drift — gives that "air" feel
    pointsRef.current.rotation.y = clock.getElapsedTime() * 0.012;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#F5F0E6"
        size={0.035}
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Camera intro animation — flies in from far/high to the resting position
// on mount, then hands control back to OrbitControls.
function IntroFlyIn() {
  const { camera } = useThree();
  const startRef = useRef<number | null>(null);
  const from = useRef(new THREE.Vector3(0, 30, 70));
  const to = useRef(new THREE.Vector3(0, 9, 22));
  const done = useRef(false);

  useEffect(() => {
    camera.position.copy(from.current);
    camera.lookAt(0, 2, 0);
  }, [camera]);

  useFrame(() => {
    if (done.current) return;
    if (startRef.current === null) startRef.current = performance.now();
    const t = Math.min(
      1,
      (performance.now() - startRef.current) / 2200,
    );
    // easeOutCubic
    const e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(from.current, to.current, e);
    camera.lookAt(0, 2, 0);
    if (t >= 1) done.current = true;
  });

  return null;
}

// OrbitControls that gently auto-rotate when idle, stop on interaction.
function OrbitControlsWithIdleAutorotate({
  hovered,
}: {
  hovered: boolean;
}) {
  const ref = useRef<any>(null);
  const [userActive, setUserActive] = useState(false);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const handleStart = () => {
      setUserActive(true);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
    const handleEnd = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setUserActive(false), 4000);
    };
    c.addEventListener("start", handleStart);
    c.addEventListener("end", handleEnd);
    return () => {
      c.removeEventListener("start", handleStart);
      c.removeEventListener("end", handleEnd);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  const autoRotate = !userActive && !hovered;

  return (
    <OrbitControls
      ref={ref}
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={45}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 2 - 0.05}
      target={[0, 2, 0]}
      autoRotate={autoRotate}
      autoRotateSpeed={0.35}
    />
  );
}

// ---------------------------------------------------------------------------

function OrgHoverCard({
  hovered,
  deptByName,
  agentsById,
}: {
  hovered: { kind: "dept"; name: string } | { kind: "person"; id: string };
  deptByName: Record<string, DeptLayout>;
  agentsById: Record<string, Agent>;
}) {
  if (hovered.kind === "dept") {
    const d = deptByName[hovered.name];
    if (!d) return null;
    return (
      <div className="absolute top-3 right-3 bg-ink/95 backdrop-blur border border-white/[0.08] rounded-lg px-3 py-2 text-xs min-w-[200px] max-w-[260px] animate-fade-up pointer-events-none">
        <div className="text-bone font-medium">{d.name}</div>
        <div className="text-dusk text-[10px]">
          {d.people.length}{" "}
          {d.people.length === 1 ? "person" : "people"}
        </div>
        <div className="mt-1.5 flex flex-col gap-0.5">
          {d.people.slice(0, 4).map((p) => (
            <span key={p.id} className="text-[10px] text-smoke">
              {p.name} · {p.role}
            </span>
          ))}
          {d.people.length > 4 && (
            <span className="text-[10px] text-dusk">
              +{d.people.length - 4} more
            </span>
          )}
        </div>
      </div>
    );
  }
  const a = agentsById[hovered.id];
  if (!a) return null;
  return (
    <div className="absolute top-3 right-3 bg-ink/95 backdrop-blur border border-white/[0.08] rounded-lg px-3 py-2 text-xs min-w-[220px] max-w-[280px] animate-fade-up pointer-events-none">
      <div className="text-bone font-medium">{a.name}</div>
      <div className="text-dusk text-[10px]">{a.role}</div>
      {a.knowledge_areas && a.knowledge_areas.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {a.knowledge_areas.slice(0, 5).map((k) => (
            <span
              key={k}
              className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-smoke border border-white/[0.06]"
            >
              {k}
            </span>
          ))}
        </div>
      )}
      <div className="mt-1.5 text-[10px] text-claret">
        Click to reach out →
      </div>
    </div>
  );
}
