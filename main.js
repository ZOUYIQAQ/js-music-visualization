// const url = 'https://stream.gensokyoradio.net/1/'

class Spectrogram {
    constructor(audio, canvas) {
        this.audio = audio
        this.canvas = canvas
        this.ctx = this.canvas.getContext('2d')
        this.isInit = false
        this.audio.onplay = this.#onplay
        this.start_frequency = 100
        this.end_frequency = 10000
        this.cut_num = 100
        this.max_higth = 80
        const { width, height } = this.canvas
        this.width = width
        this.height = height
        this.window_list = []
        this.window_size = 20
        this.gas_sigma = 1
        this.gas_kernelSize = 3
        this.rgba = [0, 0, 0, 0.5]
    }
    #onplay = () => {
        if (this.isInit) return;
        this.audCtx = new AudioContext(); //创建音视频上下文
        this.source = this.audCtx.createMediaElementSource(this.audio);
        this.analyser = this.audCtx.createAnalyser() // 分析器
        this.analyser.fftSize = 2048; // 变换的窗口大小越大越细腻 默认值2048 必须是2的N次幂；
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount) // 512 / 2
        this.source.connect(this.analyser); // 连接
        this.analyser.connect(this.audCtx.destination) // 输出
        this.isInit = true
    }
    // 播放
    play() {
        this.audio.play()
    }
    // 暂停
    pause() {
        this.audio.pause()
    }
    // 设置起始和结束频率
    set_frequency(start_f, end_f) {
        this.start_frequency = start_f
        this.end_frequency = end_f
    }
    // 设置切片数量
    set_cut_num(num) {
        this.cut_num = num
    }
    // 设置最大高度
    set_max_higth(higth) {
        this.max_higth = higth
    }
    // 设置音频持续时间
    set_window_size(size) {
        this.window_size = size
    }
    // 设置高斯平滑参数
    set_gas_param(sigma, kernelSize) {
        this.gas_sigma = sigma
        this.gas_kernelSize = kernelSize
    }
    // 设置画笔颜色
    set_rgba(r, g, b, a) {
        this.rgba = [r, g, b, a]
    }
    // 计算平均值
    #calculateAverageOfLists = (lists) => {
        // 检查输入列表是否为空
        if (lists.length === 0) return []
        // 获取列表中数组的长度
        const arrayLength = lists[0].length
        // 初始化一个数组用于存储平均值，初始值为0
        const averages = new Array(arrayLength).fill(0)
        // 遍历每个数组
        lists.forEach(list => {
            // 遍历数组中的每个元素
            list.forEach((item, index) => { averages[index] += item })
        })
        // 计算每个位置的平均值
        for (let i = 0; i < averages.length; i++) {
            averages[i] /= lists.length;
        }
        return averages;
    }
    // 音谱持续化
    #persistence = (_list) => {
        this.window_list.push(_list)
        if (this.window_list.length > this.window_size) {
            const del_num = this.window_list.length - this.window_size
            for (let i = 1; i <= del_num; i++) {
                this.window_list.shift()
            }
        }
        return this.#calculateAverageOfLists(this.window_list)
    }
    // 规范化数据个数 (采用线性插插值和切割)
    #canonical_size = (data, newSize) => {
        // 结果数组
        let result = [];
        // 原始数据大小
        const originalSize = data.length;
        // 遍历新数组的每个位置
        for (let i = 0; i < newSize; i++) {
            // 计算在原始数据中对应的位置
            const pos = (i * (originalSize - 1)) / (newSize - 1);
            // 计算pos的整数部分和小数部分
            const baseIndex = Math.floor(pos);
            const fraction = pos - baseIndex;
            // 如果pos刚好在整数位置或为最后一个位置，则直接取值
            if (fraction === 0 || baseIndex === originalSize - 1) {
                result.push(data[baseIndex]);
            } else {
                // 线性插值计算
                result.push(data[baseIndex] + (data[baseIndex + 1] - data[baseIndex]) * fraction);
            }
        }
        return result;
    }
    // 截取频率范围并调整数据个数
    #cut_frequency = (start_f, end_f, numPoints) => {
        // 获取采样率
        const sampleRate = this.audCtx.sampleRate;
        // 计算频率对应的索引
        const binCount = this.analyser.frequencyBinCount;
        const start_index = Math.floor(start_f / (sampleRate / 2) * binCount);
        const end_index = Math.ceil(end_f / (sampleRate / 2) * binCount);
        // 截取频率段
        const cutData = Array.from(this.dataArray.slice(start_index, end_index));
        // 调整数据个数
        return this.#canonical_size(cutData, numPoints);
    }
    // 规范化数组大小
    #normalizeArray = (array, maxValue) => {
        // 找出数组中的最小值和最大值
        const min = Math.min(...array);
        const max = Math.max(...array);
        // 如果所有值都相同，则返回全为最大值/2的数组
        if (min === max) return array.map(_ => 1)
        // 规范化数组中的每个值
        const normalizedArray = array.map((value, index) => {
            // 线性变换放大差距后进行反线性变换
            let _data = (((value - min) / (max - min)) ** 2) * maxValue
            // 调整数据使其更美观
            if (index > 20) _data = _data * 1.5
            if (index <= 15) _data = _data * 0.8
            return _data > 1 ? _data > maxValue ? maxValue : _data : 1
        })
        return normalizedArray
    }
    // 获取数据
    #data_dispose = () => {
        this.analyser.getByteFrequencyData(this.dataArray)
        const cut_data = this.#cut_frequency(this.start_frequency, this.end_frequency, this.cut_num)
        return this.#normalizeArray(cut_data, this.max_higth)
    }
    // 初始化绘画
    #init_draw = () => {
        this.ctx.clearRect(0, 0, this.width, this.height)
        this.ctx.beginPath()
        this.ctx.strokeStyle = `rgba(${this.rgba[0]}, ${this.rgba[1]}, ${this.rgba[2]}, ${this.rgba[3]})`
        this.ctx.fillStyle = `rgba(${this.rgba[0]}, ${this.rgba[1]}, ${this.rgba[2]}, ${this.rgba[3]})`
        this.ctx.lineWidth = 3
        this.ctx.beginPath()
    }
    // 应用高斯平滑
    #gaussian_smooth = (data, sigma, kernelSize) => {
        const gaussianKernel = [];
        let kernelSum = 0;
        const halfSize = Math.floor(kernelSize / 2);
        // 计算高斯核
        for (let i = -halfSize; i <= halfSize; i++) {
            const value = Math.exp(-(i * i) / (2 * sigma * sigma));
            gaussianKernel.push(value);
            kernelSum += value;
        }
        // 归一化高斯核
        for (let i = 0; i < gaussianKernel.length; i++) {
            gaussianKernel[i] /= kernelSum;
        }
        // 应用高斯平滑
        const smoothedData = [];
        for (let i = 0; i < data.length; i++) {
            let smoothedValue = 0;
            for (let j = -halfSize; j <= halfSize; j++) {
                const index = i + j;
                if (index >= 0 && index < data.length) {
                    smoothedValue += data[index] * gaussianKernel[j + halfSize];
                }
            }
            smoothedData.push(smoothedValue);
        }
        return smoothedData;
    }
    // 初始化数据
    #init_data = () => {
        const cut_data = this.#data_dispose()
        const gas_data = this.#gaussian_smooth(cut_data, this.gas_sigma, this.gas_kernelSize)
        return this.#persistence(gas_data)
    }
    // 绘画直方图(使用箭头函数防止this丢失)
    line_chart = () => {
        requestAnimationFrame(this.line_chart)
        if (!this.isInit) return
        this.#init_draw()
        const show_data = this.#init_data()
        const xScale = this.width / show_data.length
        for (let i = 0; i < show_data.length; i++) {
            const x = i * xScale
            const y = this.height - show_data[i] / 100 * this.height
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke()
    }
    histogram = () => {
        requestAnimationFrame(this.histogram)
        if (!this.isInit) return
        this.#init_draw()
        const show_data = this.#init_data()
        this.ctx.clearRect(0, 0, this.width, this.height);
        const barWidth = this.width / show_data.length
        show_data.forEach((value, index) => {
            const barHeight = value / 100 * this.height
            const x = index * barWidth + barWidth
            const y = this.height - barHeight
            this.ctx.fillRect(x, y, barWidth / 2, barHeight)
        })
    }
}
const audioEle = document.querySelector('audio')
audioEle.volume = 1
const canvas = document.querySelector('canvas')
const spg = new Spectrogram(audioEle, canvas)
// 范围区间 (0 ~ 22050)
spg.set_frequency(0, 800)
spg.set_cut_num(50)
spg.set_max_higth(25)
spg.set_window_size(10)
spg.set_gas_param(1, 3)
spg.set_rgba(0, 0, 0, 0.5)
spg.histogram()

document.getElementById('play').addEventListener('click', () => { document.querySelector('audio').play() })
document.getElementById('pause').addEventListener('click', () => { document.querySelector('audio').pause() })