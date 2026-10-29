// Demo scene for the lab framework (M2.1): an abstract cluster of spheres in a wireframe cube.
// No science: the positions are a plain grid, chosen only to show the controller's features.
import { SceneController, type ControllerOptions } from './SceneController';
import { cubeEdges, DEMO_POINTS } from './demo-geometry';

export class DemoScene extends SceneController {
  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
    this.camera.position.set(5, 4, 7);
    this.camera.lookAt(0, 0, 0);
  }

  override start(): void {
    super.start();
    this.addLights();
    this.addInstancedSpheres(DEMO_POINTS, 0.22, '#3b6fd8');
    this.addLineSegments(cubeEdges(1.5), '#7b8494');
    this.addLabel('cube', [0, 1.8, 0]);
    this.requestRender();
  }

  protected override update(dt: number): void {
    this.scene.rotation.y += dt * 0.6;
  }
}

export function createScene(container: HTMLElement): DemoScene {
  return new DemoScene(container);
}
