const { Client, Util } = require('discord.js')

const TOKEN = process.env.TOKEN
const PREFIX = '.'
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

const client = new Client({ disableEveryone: true })

const YouTube = require('simple-youtube-api')
const ytdl = require('ytdl-core')

const youtube = new YouTube(GOOGLE_API_KEY)


const queue = new Map()

//set warn and error events to console.warn and console.error
client.on('warn', console.warn)
client.on('error', console.error)

//ready event
client.on('ready', () => {
	//set clients activity to show server count
	client.user.setActivity(`Dank Beats`, {type: 'LISTENING'})

	console.log(`Logged in as ${client.user.username}!`)
	console.log(`Connected to ${client.guilds.size} servers`)
})

client.on('disconnect', () => {
	console.log(`Disconnected, I will attempt to reconnect now...`)
})

client.on('reconnecting', () => {
	console.log(`Reconnecting...`)
})

//message event
client.on('message', async message => {
	if (message.author.bot) return
	if (!message.content.startsWith(PREFIX)) return
	if (message.channel.type === 'dm') return

	const args = message.content.split(' ')
	const command = args.shift().slice(PREFIX.length)
	const url = args.join(' ').replace(/<(.+)>/g, '$1')

	const serverQueue = queue.get(message.guild.id)

	switch(command) {
		case 'play':
			if (!args[0]) return message.reply(`Please provide a youtube video link`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))

			const voiceChannel = message.member.voiceChannel
			if (!voiceChannel) return message.reply(`You need to be inside a channel to listen to music`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))

			const permissions = voiceChannel.permissionsFor(client.user)
			if (!permissions.has(`CONNECT`)) return message.reply(`I do not have permission to connect your voice channel`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (!permissions.has(`SPEAK`)) return message.reply(`I do not have permission to speak in your voice channel`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))

			if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
				message.channel.send(`Adding songs to queue...`).then(async msg => {
					const playlist = await youtube.getPlaylist(url).catch(error => console.error(error))
					const videos = await playlist.getVideos().catch(error => console.error(error))
	
					for (const video of Object.values(videos)) {
						try {
							const video2 = await youtube.getVideoByID(video.id)
							await handleVideo(video2, message, true)
						} catch (error) {
							console.log(`could not add video to queue: DELETED_VIDEO`)
						}
					}
	
					msg.edit(`\`${videos.length}\` songs have been added to the queue...`)
					msg.delete(10 * 1000)
				})
			} else {
				try {
					var video = await youtube.getVideo(url)
					handleVideo(video, message)
				} catch (err) {
					try {
						var videos = await youtube.searchVideos(url, 5)

						let index = 1
						let selectionString = `__**SONG SELECTION:**__\n\n${videos.map(song => `**${index++}** ${song.title}`).join('\n')}\n\nUse the reactions below to select the desired song...`

						message.channel.send(selectionString)
							.then(async msg => {

								/*
									\u0031\u20E3
									\u0032\u20E3
									\u0033\u20E3
									\u0034\u20E3
									\u0035\u20E3

								*/

								await msg.react('\u0031\u20E3')
								await msg.react('\u0032\u20E3')
								await msg.react('\u0033\u20E3')
								await msg.react('\u0034\u20E3')
								await msg.react('\u0035\u20E3')

								const filter = (reaction, user) => user.id === message.author.id
								var collector = msg.createReactionCollector(filter, { time: 30 * 1000 })

								let videoID
								collector.once('collect', async r => {
									if(r.emoji.name.includes('1')) {
										//Use song selection one
										videoID = videos[0].id
									}

									if(r.emoji.name.includes('2')) {
										//Use song selection two
										videoID = videos[1].id
									}

									if(r.emoji.name.includes('3')) {
										//Use song selection three
										videoID = videos[2].id
									}

									if(r.emoji.name.includes('4')) {
										//Use song selection four
										videoID = videos[3].id
									}

									if(r.emoji.name.includes('5')) {
										//Use song selection five
										videoID = videos[4].id
									}

									collector.stop()
								})

								collector.on('end', async collected => {
									msg.delete(0)

									try {
										let video = await youtube.getVideoByID(videoID).catch(error => console.error(error))
										await handleVideo(video, message)
									} catch (error) {
										console.error(error)
									}
								})
							})
					} catch (error) {
						console.error(error)
						message.channel.send(`I could not find any songs matching that title`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
					}
				}
			}
			message.delete(0).catch(error => console.error(error))
			break

		case 'skip':
			if (!message.member.voiceChannel) return message.reply(`You are not in a voice channel`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (!serverQueue) return message.reply(`There is nothing playing for me to skip`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (message.member.voiceChannel.id != serverQueue.voiceChannel.id) return message.reply(`You must be inside the voice channel playing music to use this command`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			serverQueue.connection.dispatcher.end(`Skipped Song`)
			message.delete(0).catch(error => console.error(error))
			break

		case 'stop':
			if (!message.member.voiceChannel) return message.reply(`You are not in a voice channel`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (!serverQueue) return message.reply(`There is nothing playing for me to stop`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (message.member.voiceChannel.id != serverQueue.voiceChannel.id) return message.reply(`You must be inside the voice channel playing music to use this command`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			serverQueue.songs = []
			serverQueue.connection.dispatcher.end(`Stopped Song`)
			message.delete(0).catch(error => console.error(error))
			break

		case 'song':
			if (!serverQueue) return message.reply(`There are no songs playing at the moment`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			message.channel.send(`Now Playing: \`${serverQueue.songs[0].title}\` in channel \`${serverQueue.voiceChannel.name}\``).then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
			message.delete(0).catch(error => console.error(error))
			break

		case 'volume':
			if (!message.member.voiceChannel) return message.reply(`You are not in a voice channel`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (!serverQueue) return message.reply(`There are no songs playing at the moment`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (message.member.voiceChannel.id != serverQueue.voiceChannel.id) return message.reply(`You must be inside the voice channel playing music to use this command`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (!args[0] || !args[0].match(/^[0-9]+$/g)) return message.reply(`The current volume is: \`${serverQueue.volume}%\``).then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
			if (parseInt(args[0]) > 200 || parseInt(args[0]) < 10) return message.reply(`Please use a volume value between \`10\` & \`200\``).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			serverQueue.volume = args[0]
			serverQueue.connection.dispatcher.setVolumeLogarithmic(parseInt(args[0]) / 100)
			message.reply(`I have set the volume to \`${serverQueue.volume}%\``).then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
			message.delete(0).catch(error => console.error(error))
			break

		case 'queue':
			if (!serverQueue) return message.reply(`There are no songs playing at the moment`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			let queueString = `__**SONG QUEUE:**__\n\n${serverQueue.songs.slice(0, 20).map(song => `**•** ${song.title}`).join('\n')}\n${serverQueue.songs.length > 20 ? `**•** +${serverQueue.songs.length - 20} remaining\n` : ``}\n**Now Playing:** ${serverQueue.songs[0].title}`
			message.channel.send(`${queueString.substr(0, 2000)}`).then(msg => msg.delete(30 * 1000)).catch(error => console.error(error))
			message.delete(0).catch(error => console.error(error))
			break

		case 'pause':
			if (serverQueue && serverQueue.playing) {
				serverQueue.playing = false
				serverQueue.connection.dispatcher.pause()
				return message.reply(`I have paused the music for you`).then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
			}
			message.reply(`There are no songs playing at the moment`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			message.delete(0).catch(error => console.error(error))
			break

		case 'resume':
			if (serverQueue && !serverQueue.playing) {
				serverQueue.playing = true
				serverQueue.connection.dispatcher.resume()
				return message.reply(`I have resumed the music for you`).then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
				message.delete(0).catch(error => console.error(error))
			}
			message.reply(`There are no songs playing at the moment`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			message.delete(0).catch(error => console.error(error))
			break
	}
})

client.login(TOKEN)

function play(guild, song) {
	const serverQueue = queue.get(guild.id)

	if (!song) {
		serverQueue.voiceChannel.leave()
		queue.delete(guild.id)
		return
	}

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url, { filter: 'audioonly' }))

	dispatcher.on('end', reason => {
		serverQueue.songs.shift()
		play(guild, serverQueue.songs[0])
	})

	dispatcher.on('error', error => console.error(error))

	dispatcher.setVolumeLogarithmic(serverQueue.volume / 100)

	serverQueue.textChannel.send(`${song.requested}, Your requested song \`${song.title}\` has started playing in channel \`${serverQueue.voiceChannel.name}\``).then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
}

async function handleVideo(video, message, playlist = false) {
	const voiceChannel = message.member.voiceChannel
	const serverQueue = queue.get(message.guild.id)

	const song = {
		id: Util.escapeMarkdown(video.id),
		title: video.title,
		url: `https://www.youtube.com/watch?v=${video.id}`,
		requested: message.author
	}

	if (!serverQueue) {
		const queueConstruct = {
			textChannel: message.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 50,
			playing: true
		}

		queue.set(message.guild.id, queueConstruct)

		queueConstruct.songs.push(song)

		try {
			await voiceChannel.join().then(connection => {
				queueConstruct.connection = connection
			})
			play(message.guild, queueConstruct.songs[0])
		} catch (error) {
			console.error(error)
			queue.delete(message.guild.id)
			message.reply(`I could not join your channel`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
		}
	} else {
		serverQueue.songs.push(song)
		if (playlist) return
		message.reply(`Song \`${song.title}\` has been added to the queue!`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
	}
}
