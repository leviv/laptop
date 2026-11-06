// 1-D bending profile of a stiff sheet being peeled.
//
// u = distance (in material units) behind the peel front.
// The sheet leaves the surface along a circular arc of radius R until it
// reaches `liftAngle`, runs straight at that angle up to the grab point
// (u = grabU), then the free tail relaxes toward `tailAngle`.
//
// We integrate (cos θ, sin θ) once per frame into a lookup table so every
// vertex is just a table read: X(u) = in-plane travel, Z(u) = height.

export class CurlProfile {
  private X = new Float32Array(1);
  private Z = new Float32Array(1);
  private T = new Float32Array(1); // tangent angle
  private step = 1;
  private n = 0;

  /**
   * @param maxU      material length to tabulate
   * @param R         curl radius
   * @param liftAngle radians, angle reached at the grab point (if the arc allows)
   * @param grabU     u at which the grab point sits (arc+straight before, tail after)
   * @param tailAngle radians, the tail relaxes toward this
   * @param tailRelax distance over which it relaxes
   * @param softness  front softness: θ ramps in smoothly over this distance
   */
  build(
    maxU: number,
    R: number,
    liftAngle: number,
    grabU: number,
    tailAngle: number,
    tailRelax: number,
    softness: number,
  ) {
    const n = Math.max(2, Math.min(1024, Math.ceil(maxU / 1.5) + 2));
    if (this.X.length < n) {
      this.X = new Float32Array(n);
      this.Z = new Float32Array(n);
      this.T = new Float32Array(n);
    }
    this.n = n;
    this.step = maxU / (n - 1);
    let x = 0,
      z = 0;
    R = Math.max(0.5, R);
    const soft = Math.max(0.001, softness);
    // angle reached at the grab point, limited by the arc length available
    const thetaAtGrab = Math.min(liftAngle, grabU / R);
    for (let i = 0; i < n; i++) {
      const u = i * this.step;
      let th: number;
      if (u <= grabU) {
        th = Math.min(liftAngle, u / R);
      } else {
        const k = Math.exp(-(u - grabU) / Math.max(1, tailRelax));
        th = tailAngle + (thetaAtGrab - tailAngle) * k;
      }
      // soften the very start so the front doesn't crease
      const s = Math.min(1, u / soft);
      th *= s * s * (3 - 2 * s);
      this.T[i] = th;
      this.X[i] = x;
      this.Z[i] = z;
      x += Math.cos(th) * this.step;
      z += Math.sin(th) * this.step;
    }
  }

  /** returns [inPlaneTravel, height, angle] at material distance u */
  sample(u: number, out: Float32Array | number[]) {
    if (u <= 0) {
      out[0] = u;
      out[1] = 0;
      out[2] = 0;
      return out;
    }
    const f = u / this.step;
    const i = Math.min(this.n - 2, Math.floor(f));
    const t = Math.min(1, f - i);
    out[0] = this.X[i] + (this.X[i + 1] - this.X[i]) * t;
    out[1] = this.Z[i] + (this.Z[i + 1] - this.Z[i]) * t;
    out[2] = this.T[i] + (this.T[i + 1] - this.T[i]) * t;
    // past the table: continue straight
    if (f > this.n - 1) {
      const extra = (f - (this.n - 1)) * this.step;
      out[0] += Math.cos(out[2]) * extra;
      out[1] += Math.sin(out[2]) * extra;
    }
    return out;
  }
}
