class FlowField {

    constructor(scale = 180) {

        this.scale = scale;

    }

    getAngle(x, y) {

        return (

            Math.sin(x / this.scale) * 2 +

            Math.cos(y / this.scale) * 2 +

            Math.sin((x + y) / (this.scale * 0.7))

        );

    }

}