const { Client, Util } = require('discord.js')
const fs = require('fs')

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
	client.user.setActivity(`Dank Tunes`, {type: 'LISTENING'})

	console.log(`Logged in as ${client.user.username}!`)
	console.log(`Connected to ${client.guilds.size} servers`)
})

client.on('disconnect', () => {
	console.log(`Disconnected, I will attempt to reconnect now...`)
})

client.on('reconnecting', () => {
	client.user.setActivity(`Updates load...`, {type: 'WATCHING'})
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
	let deleteCommand = false

	switch(command) {
		case 'play':
			deleteCommand = true
			if (!args[0]) {
				message.author.send(`Incorrect command usage... please provide a youtube search term, youtube video link or youtube playlist link.\n\`EXAMPLE: ${PREFIX}play (url/title)\``)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (!message.member.voiceChannel) {
				message.author.send(`You are not inside a voice channel... please join a channel and try again...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			const permissions = message.member.voiceChannel.permissionsFor(client.user)
			if (!permissions.has(`CONNECT`) || !permissions.has(`SPEAK`)) {
				message.author.send(`I do not have the correct permissions to join your voice channel`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

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
						let selectionString = `__**SONG SELECTION:**__\n\n${videos.map(song => `**${index++}**: ${song.title}`).join('\n')}\n\nUse the reactions below to select the desired song...`

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
								await msg.react('❌')

								const filter = (reaction, user) => user.id === message.author.id
								var collector = msg.createReactionCollector(filter, { time: 30 * 1000 })

								let videoID
								collector.once('collect', async r => {
									if(r.emoji.name.includes('1')) {
										//Use song selection one
										videoID = videos[0].id
										collector.stop()
									}

									if(r.emoji.name.includes('2')) {
										//Use song selection two
										videoID = videos[1].id
										collector.stop()
									}

									if(r.emoji.name.includes('3')) {
										//Use song selection three
										videoID = videos[2].id
										collector.stop()
									}

									if(r.emoji.name.includes('4')) {
										//Use song selection four
										videoID = videos[3].id
										collector.stop()
									}

									if(r.emoji.name.includes('5')) {
										//Use song selection five
										videoID = videos[4].id
										collector.stop()
									}

									//End Collector Process
									if(r.emoji.name === '❌') {
										collector.stop()
									}
								})

								collector.on('end', async collected => {
									msg.delete(0)

									try {
										if (videoID != null) {
											let video = await youtube.getVideoByID(videoID).catch(error => console.error(error))
											await handleVideo(video, message)	
										}
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
			break

		case 'skip':
			deleteCommand = true
			if (!message.member.voiceChannel) {
				message.author.send(`You are not inside a voice channel... please join a channel and try again...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (!serverQueue || serverQueue.songs.length === 0) {
				message.author.send(`There are no songs playing in the guild \`${message.guild.name}\``)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (message.member.voiceChannel.id != message.guild.member(client.user).voiceChannel.id) {
				message.author.send(`You must be inside the voice channel playing music to use this command...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (serverQueue.songs[0].requestedBy.id === message.author.id) {
				serverQueue.connection.dispatcher.end()
				break
			}

			let skipString = `\`${message.author.username}\` has requested to skip the current song...\n\n**one clap, two clap, three clap, forty?**\n*Click on the 👏 to vote*`			
			message.channel.send(skipString)
				.then(async msg => {

					await msg.react('👏')

					const filter = (reaction, user) => !user.bot && reaction.emoji.name === '👏'
					var collector = msg.createReactionCollector(filter, { time: 30 * 1000 })

					collector.on('collect', async r => {
						await r.users.array().forEach((user, index) => {
							let bot = message.guild.member(client.user)
	
							if (!bot.voiceChannel.members.find('id', user.id)) {
								r.remove(user).catch(error => console.log(error))
							}
						})

						if (r.count > parseInt((Math.ceil(message.member.voiceChannel.members.array().length) / 2) - 1)) {
							console.log(`skip vote successful`)
							serverQueue.connection.dispatcher.end()
							collector.stop()
						}
					})

					collector.on('end', collected => {
						msg.delete(0)
					})
				})
			break
			
		case 'shuffle':
			deleteCommand = true
			if (!message.member.voiceChannel) {
				message.author.send(`You are not inside a voice channel... please join a channel and try again...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (!serverQueue || serverQueue.songs.length === 0) {
				message.author.send(`There are no songs playing in the guild \`${message.guild.name}\``)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (message.member.voiceChannel.id != message.guild.member(client.user).voiceChannel.id) {
				message.author.send(`You must be inside the voice channel playing music to use this command...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			let shuffleString = `\`${message.author.username}\` has requested to shuffle the queue...\n\n**one clap, two clap, three clap, forty?**\n*Click on the 👏 to vote*`			
			message.channel.send(shuffleString)
				.then(async msg => {

					await msg.react('👏')

					const filter = (reaction, user) => !user.bot && reaction.emoji.name === '👏'
					var collector = msg.createReactionCollector(filter, { time: 30 * 1000 })
					
					const requestingUsers = []
					serverQueue.songs.forEach((song, index) => {
						if (!requestingUsers.includes(song.requestedBy)) {
							requestingUsers.push(song.requestedBy)	
						}
					})

					collector.on('collect', async r => {
						await requestingUsers.forEach((user, index) => {
							if (!r.users.find('id', user.id)) {
								r.remove(user).catch(error => console.log(error))
							}
						})

						if (r.count > parseInt((Math.ceil(requestingUsers.length) / 2) - 1)) {
							console.log(`shuffle vote successful`)
							
							let songs = serverQueue.songs
							let firstSong = songs.shift()
							
							let clonedQueue = songs.slice()
							
							songs.shift()
							songs.forEach((song, index) => {
								let newIndex = (index + Math.floor((Math.random() * songs.length) + 1))
								if (newIndex > songs.length) {
									newIndex = songs.length
								}
								
								clonedQueue.splice(index, 1)
								clonedQueue.splice(newIndex, 0, song)
							})
							
							clonedQueue.splice(0, 0, firstSong)
							serverQueue.songs = clonedQueue
							collector.stop()
						}
					})

					collector.on('end', collected => {
						msg.delete(0)
					})
				})
			break

		case 'clear':
			deleteCommand = true
			if (!message.member.voiceChannel) return message.reply(`You are not in a voice channel`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (!serverQueue) return message.reply(`There is nothing playing for me to stop`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			if (serverQueue.songs.length === 0) return message.reply(`There are no songs playing at the moment`).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			
			/**
			
			let mentioned_users = []
			if (message.mentions) {
				if (!message.guild.member(message.author).hasPermission('MANAGE_MESSAGES')) {
					message.author.send(`You have invalid permissions to clear others users songs from the queue`).catch(error => console.log(error))
					break
				}
				
				mentioned_users = message.mentions.users.array()
			}
			
			**/
			
			let requestedSongs = serverQueue.songs.filter(song => song.requestedBy.id === message.author.id)
			let isCurrentSong = false
			
			if (requestedSongs.length === 0) {
				let noSongsString = message.mentions ? `user ${message.author} has no requested songs in this queue` : `You have no requested songs in this queue`
				message.author.send(noSongsString).then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}
			
			requestedSongs.forEach((song, index) => {
				let queueIndex = serverQueue.songs.indexOf(song)
				
				if (queueIndex === 0 && !isCurrentSong) {
					isCurrentSong = true
				} else {
					serverQueue.songs.splice(queueIndex, 1)
				}
			})

			if (isCurrentSong) {
				serverQueue.connection.dispatcher.end()
			}
			break

		case 'song':
			deleteCommand = true
			if (!serverQueue || serverQueue.songs.length === 0) {
				message.author.send(`There are no songs playing in the guild \`${message.guild.name}\``)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			let durationString = serverQueue.songs[0].duration.hours > 0 ? `${serverQueue.songs[0].duration.hours} HOURS, ${serverQueue.songs[0].duration.minutes} MINUTES & ${serverQueue.songs[0].duration.seconds} SECONDS.` : serverQueue.songs[0].isStream ? `• LIVE` : `${serverQueue.songs[0].duration.minutes} MINUTES & ${serverQueue.songs[0].duration.seconds} SECONDS.`
			let lines = serverQueue.songs[0].description.split('\n')
			let newDescription = lines.slice(0, 20).join('\n')
			
			let songString = `__**CURRENT SONG INFORMATION:**__\n\nTitle: \`${serverQueue.songs[0].title}\`\n\nDescription:\n\`\`\`${newDescription}\`\`\`\nDuration: \`${durationString}\``
			message.channel.send(`${songString.substr(0, 2000)}`).then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
			break

		case 'volume':
			deleteCommand = true
			if (!serverQueue || serverQueue.songs.length === 0) {
				message.author.send(`There are no songs playing in the guild \`${message.guild.name}\``)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (!message.member.voiceChannel) {
				message.author.send(`You are not inside a voice channel... please join a channel and try again...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (message.member.voiceChannel.id != message.guild.member(client.user).voiceChannel.id) {
				message.author.send(`You must be inside the voice channel playing music to use this command...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (!args[0] || !args[0].match(/^[0-9]+$/g)) {
				message.channel.send(`The current volume is: \`${serverQueue.volume}%\``)
					.then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
				break
			}

			if (parseInt(args[0]) > 200 || parseInt(args[0]) < 10) {
				message.author.send(`Please use a volume value between \`10\` & \`200\``)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			serverQueue.volume = args[0]
			serverQueue.connection.dispatcher.setVolumeLogarithmic(parseInt(args[0]) / 100)

			serverQueue.songs[0].requestedIn.send(`\`${message.author.username}\` has set the volume to \`${serverQueue.volume}%\``)
				.then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
			break

		case 'queue':
			deleteCommand = true
			if (!serverQueue || serverQueue.songs.length === 0) {
				message.author.send(`There are no songs playing in the guild \`${message.guild.name}\``)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			let queueString = `__**SONG QUEUE:**__\n\n\`\`\`${serverQueue.songs.slice(0, 10).map(song => `• ${song.title}\nRequested By: ${song.requestedBy.username}`).join('\n\n')}\n\n${serverQueue.songs.length > 10 ? `• +${serverQueue.songs.length - 10} remaining\n` : ``}\`\`\``
			message.channel.send(`${queueString.substr(0, 2000)}`)
				.then(msg => msg.delete(30 * 1000)).catch(error => console.error(error))
			break

		case 'pause':
			deleteCommand = true
			if (!serverQueue || serverQueue.songs.length === 0) {
				message.author.send(`There are no songs playing in the guild \`${message.guild.name}\``)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (!message.member.voiceChannel) {
				message.author.send(`You are not inside a voice channel... please join a channel and try again...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (message.member.voiceChannel.id != message.guild.member(client.user).voiceChannel.id) {
				message.author.send(`You must be inside the voice channel playing music to use this command...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (serverQueue && serverQueue.playing) {
				serverQueue.playing = false
				serverQueue.connection.dispatcher.pause()

				serverQueue.songs[0].requestedIn.send(`\`${message.author.username}\` has paused the current song \`${serverQueue.songs[0].title}\``)
					.then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
				
				message.author.send(`You've paused \`${serverQueue.songs[0].title}\` in \`${message.guild.name}\`, you have \`3\` minutes to unpause the bot using \`${PREFIX}resume\` before the song is skipped...`)
				
				client.setTimeout(() => {
					if(serverQueue && !serverQueue.playing) {
						serverQueue.playing = true
						serverQueue.connection.dispatcher.end()
					}
				}, 180 * 1000)
				break
			}

			message.author.send(`There are no songs playing in the guild \`${message.guild.name}\``)
				.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			break

		case 'resume':
			deleteCommand = true
			if (!serverQueue || serverQueue.songs.length === 0) {
				message.author.send(`There are no songs playing in the guild \`${message.guild.name}\``)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (!message.member.voiceChannel) {
				message.author.send(`You are not inside a voice channel... please join a channel and try again...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (message.member.voiceChannel.id != message.guild.member(client.user).voiceChannel.id) {
				message.author.send(`You must be inside the voice channel playing music to use this command...`)
					.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
				break
			}

			if (serverQueue && !serverQueue.playing) {
				serverQueue.playing = true
				serverQueue.connection.dispatcher.resume()
				break
			}

			message.author.send(`There are no songs playing in the guild \`${message.guild.name}\``)
				.then(msg => msg.delete(10 * 1000)).catch(error => console.error(error))
			break
			
		case 'help':
			deleteCommand = true
			let json = JSON.parse(fs.readFileSync('./help.json', 'utf8'))['results']
			for (i in json) {
				var cmd = ''
				for (j in json[i]) {
					var category = json[i]
					cmd += `\n\`${PREFIX}${category[j].usage}\` | ${category[j].desc}\n`
				}
				message.author.send(`**${i}**\n${cmd}---------------\n`)
			}
			message.author.send(`\`(required)\` | \`<optional>\``)
			break
	}
	if (deleteCommand) message.delete(0).catch(error => console.error(error))
})

client.login(TOKEN)

async function play(guild, song) {
	const serverQueue = queue.get(guild.id)

	if (!song) {
		guild.member(client.user).voiceChannel.leave()
		queue.delete(guild.id)
		return
	}

	if (guild.member(song.requestedBy) && guild.member(song.requestedBy).voiceChannel) {
		if (guild.member(client.user).voiceChannel.id != guild.member(song.requestedBy).voiceChannel.id) {
			await guild.member(song.requestedBy).voiceChannel.join()
				.then(connection => {
					serverQueue.connection = connection
					serverQueue.volume = 50
				}).catch(error => console.error(error))
		}
	} else {
		serverQueue.songs.shift()
		play(guild, serverQueue.songs[0])
	}
	
	//ytdl.getInfo(song.url).then(info => console.log(info)).catch(error => console.log(error))
	
	let format = song.isStream ? {quality: '91'} : {filter: 'audioonly', quality: 'highestaudio'}
	const dispatcher = serverQueue.connection.playStream(ytdl(song.url, format))

	dispatcher.on('end', reason => {
		serverQueue.songs.shift()
		play(guild, serverQueue.songs[0])
	})

	dispatcher.on('error', error => console.error(error))

	dispatcher.setVolumeLogarithmic(serverQueue.volume / 100)

	song.requestedIn.send(`${song.requestedBy}, Your requested song \`${song.title}\` has started playing in channel \`${guild.member(song.requestedBy).voiceChannel.name}\``).then(msg => msg.delete(20 * 1000)).catch(error => console.error(error))
}

async function handleVideo(video, message, playlist = false) {
	const serverQueue = queue.get(message.guild.id)
	const botCommandsChannel = message.guild.channels.find('name', 'bot-commands') ? message.guild.channels.findAll('name', 'bot-commands').pop() : message.channel
	
	const song = {
		id: Util.escapeMarkdown(video.id),
		title: video.title,
		description: video.description,
		duration: { hours: video.duration.hours, minutes: video.duration.minutes, seconds: video.duration.seconds },
		url: `https://www.youtube.com/watch?v=${video.id}`,
		isStream: video.raw.snippet.liveBroadcastContent != 'none',
		requestedBy: message.author,
		requestedIn: message.channel.name === 'bot-commands' ? message.channel : botCommandsChannel
	}

	if (!serverQueue) {
		const queueConstruct = {
			connection: null,
			songs: [],
			volume: 50,
			playing: true
		}

		queue.set(message.guild.id, queueConstruct)

		queueConstruct.songs.push(song)

		try {
			await message.guild.member(song.requestedBy).voiceChannel.join().then(connection => {
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
