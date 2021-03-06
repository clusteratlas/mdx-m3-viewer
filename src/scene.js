/**
 * @class
 * @classdesc A scene.
 *            Scenes allow to render different model views with different cameras.
 */
function Scene(env) {
    let canvas = env.canvas,
        camera = new Camera(Math.PI / 4, 1, 8, 100000);

    /** @member {ModelViewer} */
    this.env = env;
    /** @member {ModelView[]} */
    this.modelViews = [];
    /** @member {Camera} */
    this.camera = camera;
    /** @member {boolean} */
    this.rendered = true;

    // Default the camera's viewport to the whole canvas used by the viewer
    camera.setViewport([0, 0, canvas.width, canvas.height]);
}

Scene.prototype = {
    /** @member {string} */
    get objectType() {
        return "scene";
    },

    /**
     * @method
     * @desc Adds a new view to this scene, while setting the view's scene to this scene.
     * @param {ModelView} modelView The model view to add.
     */
    addView(modelView) {
        if (modelView && modelView.objectType === "modelview") {
            this.modelViews.push(modelView);
        }
    },

    /**
     * @method
     * @desc Removes the given view from this scene, if it was in it.
     * @param {ModelView} modelView The model view to remove.
     */
    removeView(modelView) {
        if (modelView && modelView.objectType === "modelview") {
            this.modelViews.delete(modelView);
        }
    },

    /**
     * @method
     * @desc Clears all of the model views in this scene.
     */
    clear() {
        let views = this.modelViews;

        for (let i = 0, l = views.length; i < l; i++) {
            views[i].clear();
        }

        this.modelViews = [];
    },

    renderOpaque() {
        if (this.rendered) {
            let views = this.modelViews;

            this.setViewport();

            for (let i = 0, l = views.length; i < l; i++) {
                views[i].renderOpaque();
            }
        }
    },

    renderTranslucent() {
        if (this.rendered) {
            let views = this.modelViews;

            this.setViewport();

            for (let i = 0, l = views.length; i < l; i++) {
                views[i].renderTranslucent();
            }
        }
    },

    renderEmitters() {
        if (this.rendered) {
            let views = this.modelViews;
            
            this.setViewport();

            for (let i = 0, l = views.length; i < l; i++) {
                views[i].renderEmitters();
            }
        }
    },

    setViewport() {
        let viewport = this.camera.viewport;

        this.env.gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    }
};
