import Hyprland from 'resource:///com/github/Aylur/ags/service/hyprland.js';

import Cairo from 'cairo';
const {GdkPixbuf, Gdk} = imports.gi;

const get_cursor = async () => {
    return Hyprland.sendMessage("cursorpos").then((pos) => {
        return pos.split(',').map((x) => parseInt(x))
    })
}

const rand_int = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const rand_float = (min, max) => {
    return Math.random() * (max - min) + min;
}

const SCREEN_WIDTH = Number(
    Utils.exec(
      `bash -c "xrandr --current | grep '*' | uniq | awk '{print $1}' | cut -d 'x' -f1 | head -1"`
    )
);

const SCREEN_HEIGHT = Number(
  Utils.exec(
    `bash -c "xrandr --current | grep '*' | uniq | awk '{print $1}' | cut -d 'x' -f2 | head -1"`
  )
);

let prev_regions = []
let prev_regions_time = 0

let fumoing = true

let passes = 0

const get_window_regions = () => {
    if (Date.now() - prev_regions_time < 100) return prev_regions;
    let regions = []
    try{
        let clients = Utils.exec("hyprctl clients -j")
        clients = JSON.parse(clients)
        for (let client of clients) {
            if (client.workspace.id !== Hyprland.active.workspace.id) continue;

            let [x, y] = client.at
            let [width, height] = client.size
            let [x2, y2] = [x + width, y + height]

            if (x < 0) x = 0
            if (y < 0) y = 0
            if (x2 > SCREEN_WIDTH) x2 = SCREEN_WIDTH
            if (y2 > SCREEN_HEIGHT) y2 = SCREEN_HEIGHT

            regions.push([x, y, x2, y2])
        }
    }catch (e) {print("error",e)}
    prev_regions = regions
    prev_regions_time = Date.now()
    return regions
}

const FPS = 60
const MIN_RADIUS = 30
const MAX_RADIUS = 50

let last_frame = Date.now()
let frame_time = 0


let fumos_jump_time =  Date.now()

class Fumo {
    constructor() {
        this.to_x = 0
        this.to_y = 0

        this.gravity = 5
        this.drag = rand_float(0.1, 0.2)

        this.width = 100
        this.height = 100
        this.rotation = 0

        this.x = rand_int(0, 100)
        this.y = SCREEN_HEIGHT - 2*this.height

        this.toss_time = fumos_jump_time

        fumos_jump_time += 10

        this._x_speed = 0
        this._y_speed = 0

        this._rotation_speed = 0

        this.do_toss = true
        this.on_ground = false

        this.pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
            App.configDir + '/fumo.png',
            this.width,
            this.height,
            true
        )
    }

    update(all_fumos) {
        let dx = this.to_x - this.x
        let dy = this.to_y - this.y
        let angle = rand_float(0, 2*Math.PI)
        let dist = Math.sqrt(dx * dx + dy * dy)

        // if on edge of screen, bounce
        if (this.x < 0 || this.x > SCREEN_WIDTH) {
            this._x_speed = -this._x_speed / 10
        }
        if (this.y < 0 || this.y > SCREEN_HEIGHT - 2*this.height) {
            this._y_speed = -this._y_speed / 10
        }

        if (this.y < SCREEN_HEIGHT - 2*this.height) {
            this._y_speed += this.gravity
            this._rotation_speed = this._rotation_speed>0?this._rotation_speed-0.01:this._rotation_speed+0.01
        } else {
            // this.rotation = 0
            this.on_ground = true
        }
        // print(this.on_ground, this.do_toss)

        // toss
        if (this.do_toss && this.on_ground && Date.now() - this.toss_time > 500) {
            this.on_ground = false
            this._x_speed += Math.cos(angle) * Math.min(dist, 5*this.height) * this.drag
            this._y_speed += Math.sin(angle) * Math.min(dist, 5*this.height) * this.drag

            if (dx < 0) {
                this._rotation_speed = -0.1
            } else {
                this._rotation_speed = 0.1
            }

            this.toss_time = Date.now()
        }

        // collision with other fumos, if on another fumo set on_ground = true and dont toss fumo below
        for (let fumo of all_fumos) {
            if (fumo === this) continue;

            let dx = fumo.x - this.x
            let dy = fumo.y - this.y

            let dist = Math.sqrt(dx * dx + dy * dy)

            this.do_toss = true
            if (dist < this.width) {
                let angle = Math.atan2(dy, dx)
                if (this.y < fumo.y) {
                    this.do_toss = false
                }
                let force = (this.height + fumo.height) - dist

                this._x_speed -= Math.cos(angle) * force * this.drag
                this._y_speed -= Math.sin(angle) * force * this.drag

                this.on_ground = true
                
            }
        }

        // window collisions
        for (let region of get_window_regions()) {
            let [x, y, x2, y2] = region

            y -= 50

            // this.on_ground = false
            if (this.x > x - this.width && this.x < x2 + this.width && this.y > y - this.height && this.y < y2 + this.height) {
                let dx = this.x - (x + x2) / 2
                let dy = this.y - (y + y2) / 2

                let angle = Math.atan2(dy, dx)

                let dist_from_edge = Math.min(
                    Math.abs(this.x - (x - 2*this.width)),
                    Math.abs(this.x - (x2 + 2*this.width)),
                    Math.abs(this.y - (y - 2*this.height)),
                    Math.abs(this.y - (y2 + 2*this.height))
                )

                let force = (this.height + 10) - 1.5*dist_from_edge

                // this._x_speed -= Math.cos(angle) * force * this.drag
                this._y_speed -= Math.sin(angle) * force * this.drag
                this.on_ground = true
            }
        }

        this._x_speed *= 1 - this.drag
        this._y_speed *= 1 - this.drag

        this.x += this._x_speed
        this.y += this._y_speed

        if (this.y > SCREEN_HEIGHT - 2*this.height) {
            this.y = SCREEN_HEIGHT - 2*this.height
        }
        // this.rotation += this._rotation_speed

    }

    draw(ctx) {
        try{
            ctx.save()
            ctx.translate(this.x, this.y)
            ctx.rotate(this.rotation)
            // draw from pixbuf

            Gdk.cairo_set_source_pixbuf(ctx, this.pixbuf, 0, 0)

            ctx.paint()

            ctx.restore()
        } catch (e) {
            // print(e)
            
            // reset
            this.x = rand_int(0, 100)
            this.y = SCREEN_HEIGHT - 2*this.height
    
            this.to_x = 0
            this.to_y = 0

            this._x_speed = 0
            this._y_speed = 0

        }
    }
}

export const Furnance = ({
    all_soots = [...Array.from({length: 1}, () => new Fumo())],
    chase = Variable([], {})
}) => Widget.DrawingArea({
    css: 'all: unset;',
    class_name: 'furnance',
}).on('draw', (self, ctx) => {
    for (let soot of all_soots) {
        // print("found soot")
        soot.draw(ctx);
    }
}).poll(1000/FPS, async (self) => {
    try {
        for (let soot of all_soots) {
            soot.update(all_soots);
            
        }
        self.queue_draw()
    }catch (e) {
        // print(e)
    }
    //cursor pos
})
.poll(10, (self) => {
    if (!fumoing) return;
    print("Fumomark:", all_soots.length,"fumos")
    all_soots.push(new Fumo())
    if (passes > 10) {
        fumoing = false
        print("fumo tossing reached 30 fps at", all_soots.length, "fumos :(")
    }
})
.poll(1000/FPS, async (self) => {
    frame_time = Date.now() - last_frame
    last_frame = Date.now()
    if (frame_time > 1000/30) {
        passes += 1
    }
    try {
        let [x,y] = await get_cursor()
        let first_soot = all_soots[0]
        first_soot.to_x = x
        first_soot.to_y = y
        for (let soot of all_soots) {
            let dist_to_cursor = Math.sqrt((soot.x - x) ** 2 + (soot.y - y) ** 2)
            Utils.timeout(dist_to_cursor / soot._max_dist * 1000, () =>{
                soot.to_x = x
                soot.to_y = y
            })
        }        
    }catch (e) {
        // print(e)
    }
    //cursor pos
})