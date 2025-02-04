import type { Canvas, FederatedPointerEvent, RenderingPlugin, RenderingService } from '@antv/g';
import { inject, RenderingContext, RenderingPluginContribution, singleton } from '@antv/g';
import { EventEmitter } from 'eventemitter3';
import { DrawerTool } from './constants/enum';
import { CircleDrawer } from './drawers/circle';
import { PolygonDrawer } from './drawers/polygon';
import { PolylineDrawer } from './drawers/polyline';
import { RectDrawer } from './drawers/rect';
import type { BaseDrawer, DrawerState } from './interface/drawer';
import { renderCircle } from './rendering/circle-render';
import { renderPolygon } from './rendering/polygon-render';
import { renderPolyline } from './rendering/polyline-render';
import { renderRect } from './rendering/rect-render';
import { AnnotationPluginOptions } from './tokens';

/**
 * Provides drawing capability like free drawing mode in fabric.js.
 * @see http://fabricjs.com/freedrawing
 */
@singleton({ contrib: RenderingPluginContribution })
export class AnnotationPlugin implements RenderingPlugin {
  static tag = 'Annotation';

  @inject(RenderingContext)
  private renderingContext: RenderingContext;

  @inject(AnnotationPluginOptions)
  private annotationPluginOptions: AnnotationPluginOptions;

  private hotkeyActive: boolean = false;
  public drawer: BaseDrawer;
  public emmiter = new EventEmitter();
  public canvas: Canvas;

  /**
   *
   * @param id
   * @returns
   */
  private getAnnotationObjects(id: string) {
    return this.canvas.document.getElementsByClassName(id);
  }
  /**
   * 取消标注（仅从画布移除）
   * @param id
   */
  private cancelDrawer(id: string) {
    const annos = this.getAnnotationObjects(id);
    annos.forEach((anno) => anno.remove());
  }

  /**
   * 绘制标注
   * @param anno
   */
  public renderDrawer(anno: DrawerState) {
    this.cancelDrawer(anno.id);
    if (anno.type === 'circle') {
      renderCircle(this, anno);
    }
    if (anno.type === 'rect') {
      renderRect(this, anno);
    }

    if (anno.type === 'polygon') {
      renderPolygon(this, anno);
    }

    if (anno.type === 'polyline') {
      renderPolyline(this, anno);
    }
  }

  /**
   * 激活标注
   * @param id
   */
  setActiveAnnotation = (id: string) => {
    // TODO
  };

  /**
   * 使用绘制工具
   * @param tool
   * @param options
   * @returns
   */
  setDrawer(tool: DrawerTool, options) {
    let activeDrawer;
    switch (tool) {
      case DrawerTool.Circle:
        activeDrawer = new CircleDrawer(options);
        break;
      case DrawerTool.Rect:
        activeDrawer = new RectDrawer(options);
        break;
      case DrawerTool.Polygon:
        activeDrawer = new PolygonDrawer(options);
        break;
      case DrawerTool.Polyline:
        activeDrawer = new PolylineDrawer(options);
        break;
      default:
        break;
    }
    activeDrawer?.setCanvas(this.canvas);
    const onStart = (toolstate: any) => {
      this.emmiter.emit('draw:start', toolstate);
      this.renderDrawer(toolstate);
    };

    const onMove = (toolstate: any) => {
      this.emmiter.emit('draw:move', toolstate);
      this.renderDrawer(toolstate);
    };

    const onModify = (toolstate: any) => {
      this.emmiter.emit('draw:modify', toolstate);
      this.renderDrawer(toolstate);
    };

    const onComplete = (toolstate: any) => {
      if (this.annotationPluginOptions.destroyAfterComplete !== false) {
        this.cancelDrawer(toolstate.id);
      }
      this.emmiter.emit('draw:complete', toolstate);
    };

    const onCancel = (toolstate: any) => {
      this.cancelDrawer(toolstate.id);
      this.emmiter.emit('draw:cancel', toolstate);
    };

    /** 监听绘制事件 */
    activeDrawer.on('draw:start', onStart);
    activeDrawer.on('draw:modify', onModify);
    activeDrawer.on('draw:move', onMove);
    activeDrawer.on('draw:complete', onComplete);
    activeDrawer.on('draw:cancel', onCancel);

    if (this.drawer) this.drawer.dispose();

    /**  */
    this.drawer = activeDrawer;
    this.emmiter.emit('drawer:enable', activeDrawer);
    // todo
    this.canvas.setCursor('crosshair');
    return activeDrawer;
  }

  /**
   * 冻结绘制工具
   */
  freezeDrawer() {
    this.drawer.isActive = false;
  }

  unfreezeDrawer() {
    this.drawer.isActive = true;
  }

  /**
   * 清除绘制工具
   */
  clearDrawer() {
    this.drawer = undefined;
    this.canvas.setCursor('grab');
  }

  apply(renderingService: RenderingService) {
    const document = this.renderingContext.root.ownerDocument;
    const canvas = document.defaultView as Canvas;
    this.canvas = canvas;

    const handleMouseDown = (e: FederatedPointerEvent) => {
      if (e.button === 0) {
        this.drawer?.onMouseDown(e);
      }
    };

    const handleMouseMove = (e: FederatedPointerEvent) => {
      this.drawer?.onMouseMove(e);
    };

    const handleMouseUp = (e: FederatedPointerEvent) => {
      if (e.button === 0) {
        this.drawer?.onMouseUp(e);
      }
    };

    const handleMouseDbClick = (e: FederatedPointerEvent) => {
      if (e.button === 0) {
        this.drawer?.onMouseDbClick(e);
      }
    };

    const handleClick = (e: FederatedPointerEvent) => {
      if (e.detail === 2) handleMouseDbClick(e);
    };

    const handleDrawerKeyDown = (e) => {
      this.drawer?.onKeyDown?.(e);
    };

    const handleKeyDown = (e) => {
      if (!this.hotkeyActive) return;
      if (this.drawer?.isDrawing) {
        handleDrawerKeyDown(e);
      }

      const active = this.drawer;
      if (e.key === 'ArrowLeft') {
        active.path = active.path.map((point) => ({ x: point.x - 1, y: point.y }));
      }
      if (e.key === 'ArrowUp') {
        active.path = active.path.map((point) => ({ x: point.x, y: point.y - 1 }));
      }
      if (e.key === 'ArrowRight') {
        active.path = active.path.map((point) => ({ x: point.x + 1, y: point.y }));
      }
      if (e.key === 'ArrowDown') {
        active.path = active.path.map((point) => ({ x: point.x, y: point.y + 1 }));
      }
      // this.renderDrawer(active);
    };

    const handleCanvasEnter = () => {
      this.hotkeyActive = true;
    };

    const handleCanvasLeave = () => {
      this.hotkeyActive = false;
    };

    renderingService.hooks.init.tapPromise(AnnotationPlugin.tag, async () => {
      canvas.addEventListener('click', handleClick);
      canvas.addEventListener('pointerdown', handleMouseDown);
      canvas.addEventListener('pointermove', handleMouseMove);
      canvas.addEventListener('pointerup', handleMouseUp);

      canvas.document.addEventListener('pointerenter', handleCanvasEnter);
      canvas.document.addEventListener('pointerleave', handleCanvasLeave);
      window.addEventListener('keydown', handleKeyDown);
    });

    renderingService.hooks.destroy.tap(AnnotationPlugin.tag, () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('pointerdown', handleMouseDown);
      canvas.removeEventListener('pointermove', handleMouseMove);
      canvas.removeEventListener('pointerup', handleMouseUp);

      canvas.document.removeEventListener('pointerenter', handleCanvasEnter);
      canvas.document.removeEventListener('pointerleave', handleCanvasLeave);
      window.removeEventListener('keydown', handleKeyDown);
    });
  }
}
